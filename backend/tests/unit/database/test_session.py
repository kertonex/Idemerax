from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, status
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import session as session_module
from app.infrastructure.database.session import (
    RETRYABLE_POSTGRES_SQLSTATES,
    SessionFactory,
    _get_postgres_sqlstate,
    get_session,
)


class FakePostgresError(Exception):
    """Simulate a PostgreSQL exception exposing sqlstate."""

    def __init__(self, sqlstate: str | None = None) -> None:
        super().__init__("Database operation failed")
        self.sqlstate = sqlstate


class FakePostgresErrorWithPgcode(Exception):
    """Simulate a PostgreSQL driver exposing pgcode instead of sqlstate."""

    def __init__(self, pgcode: str | None = None) -> None:
        super().__init__("Database operation failed")
        self.pgcode = pgcode


class FakeDiagnostic:
    """Simulate PostgreSQL diagnostic information."""

    def __init__(self, sqlstate: str | None = None) -> None:
        self.sqlstate = sqlstate


class FakePostgresErrorWithDiag(Exception):
    """Simulate a PostgreSQL exception exposing diag.sqlstate."""

    def __init__(self, sqlstate: str | None = None) -> None:
        super().__init__("Database operation failed")
        self.diag = FakeDiagnostic(sqlstate)


class FakeSession:
    """Provide a lightweight asynchronous session for unit tests."""

    def __init__(self, *, in_transaction: bool = True) -> None:
        self.transaction_active = in_transaction
        self.commit = AsyncMock()
        self.rollback = AsyncMock()

    def in_transaction(self) -> bool:
        return self.transaction_active


class FakeSessionContext:
    """Simulate the asynchronous session context manager."""

    def __init__(self, session: FakeSession) -> None:
        self.session = session

    async def __aenter__(self) -> FakeSession:
        return self.session

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: Any,
    ) -> bool:
        return False


def make_db_error(sqlstate: str | None = None) -> DBAPIError:
    """Create a database exception with an optional PostgreSQL SQLSTATE."""
    original_error = FakePostgresError(sqlstate)

    return DBAPIError(
        statement="SELECT 1",
        params=None,
        orig=original_error,
    )


async def start_session(
    monkeypatch: pytest.MonkeyPatch,
    session: FakeSession,
) -> AsyncGenerator[AsyncSession, None]:
    """Start get_session with a mocked session context manager."""
    monkeypatch.setattr(
        session_module,
        "SessionFactory",
        lambda: FakeSessionContext(session),
    )

    generator = get_session()
    yielded_session = await anext(generator)

    assert yielded_session is session

    return generator


@pytest.mark.anyio
async def test_session_factory_creates_async_sessions() -> None:
    """Verify that the session factory creates async database sessions."""
    session = SessionFactory()

    try:
        assert isinstance(session, AsyncSession)
    finally:
        await session.close()


@pytest.mark.anyio
async def test_get_session_commits_when_transaction_is_active(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Commit after successful request processing with an active transaction."""
    session = FakeSession(in_transaction=True)
    generator = await start_session(monkeypatch, session)

    with pytest.raises(StopAsyncIteration):
        await anext(generator)

    session.commit.assert_awaited_once()
    session.rollback.assert_not_awaited()


@pytest.mark.anyio
async def test_get_session_does_not_commit_without_active_transaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Avoid committing when no transaction remains active."""
    session = FakeSession(in_transaction=False)
    generator = await start_session(monkeypatch, session)

    with pytest.raises(StopAsyncIteration):
        await anext(generator)

    session.commit.assert_not_awaited()
    session.rollback.assert_not_awaited()


@pytest.mark.anyio
async def test_get_session_rolls_back_after_general_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Roll back and propagate the original application exception."""
    session = FakeSession()
    generator = await start_session(monkeypatch, session)
    error = RuntimeError("Operation failed")

    with pytest.raises(RuntimeError) as exc_info:
        await generator.athrow(error)

    assert exc_info.value is error
    session.rollback.assert_awaited_once()
    session.commit.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize("sqlstate", ["40001", "40P01"])
async def test_get_session_maps_retryable_database_errors_to_503(
    monkeypatch: pytest.MonkeyPatch,
    sqlstate: str,
) -> None:
    """Map serialization failures and deadlocks to HTTP 503."""
    session = FakeSession()
    generator = await start_session(monkeypatch, session)
    error = make_db_error(sqlstate)

    with pytest.raises(HTTPException) as exc_info:
        await generator.athrow(error)

    assert exc_info.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert exc_info.value.headers == {"Retry-After": "1"}
    assert "Idempotency-Key" in exc_info.value.detail
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_get_session_propagates_non_retryable_database_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Propagate database errors that are not classified as retryable."""
    session = FakeSession()
    generator = await start_session(monkeypatch, session)
    error = make_db_error("23505")

    with pytest.raises(DBAPIError) as exc_info:
        await generator.athrow(error)

    assert exc_info.value is error
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_get_session_preserves_database_error_if_rollback_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Preserve the original database exception when rollback also fails."""
    session = FakeSession()
    session.rollback.side_effect = RuntimeError("Rollback failed")
    generator = await start_session(monkeypatch, session)
    error = make_db_error("23505")

    with pytest.raises(DBAPIError) as exc_info:
        await generator.athrow(error)

    assert exc_info.value is error
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_get_session_preserves_exception_if_rollback_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Preserve an application exception if rollback fails."""
    session = FakeSession()
    session.rollback.side_effect = RuntimeError("Rollback failed")
    generator = await start_session(monkeypatch, session)
    error = ValueError("Invalid operation")

    with pytest.raises(ValueError) as exc_info:
        await generator.athrow(error)

    assert exc_info.value is error
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_get_session_rolls_back_when_commit_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Roll back and propagate a database error raised during commit."""
    session = FakeSession()
    error = make_db_error("23505")
    session.commit.side_effect = error
    generator = await start_session(monkeypatch, session)

    with pytest.raises(DBAPIError) as exc_info:
        await anext(generator)

    assert exc_info.value is error
    session.commit.assert_awaited_once()
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_get_session_maps_retryable_commit_error_to_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Map a retryable database error during commit to HTTP 503."""
    session = FakeSession()
    session.commit.side_effect = make_db_error("40001")
    generator = await start_session(monkeypatch, session)

    with pytest.raises(HTTPException) as exc_info:
        await anext(generator)

    assert exc_info.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    session.rollback.assert_awaited_once()


def test_retryable_postgres_sqlstates_are_configured() -> None:
    """Verify the expected PostgreSQL retryable SQLSTATE values."""
    assert RETRYABLE_POSTGRES_SQLSTATES == frozenset({"40001", "40P01"})


@pytest.mark.parametrize(
    ("original_error", "expected_sqlstate"),
    [
        (FakePostgresError("40001"), "40001"),
        (FakePostgresErrorWithPgcode("40P01"), "40P01"),
        (FakePostgresErrorWithDiag("40001"), "40001"),
        (Exception("No SQLSTATE"), None),
    ],
)
def test_get_postgres_sqlstate_extracts_supported_formats(
    original_error: Exception,
    expected_sqlstate: str | None,
) -> None:
    """Extract SQLSTATE from common PostgreSQL driver exception formats."""
    error = DBAPIError(
        statement="SELECT 1",
        params=None,
        orig=original_error,
    )

    assert _get_postgres_sqlstate(error) == expected_sqlstate
