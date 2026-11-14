from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy.dialects import postgresql

from app.infrastructure.repositories.refresh_session import RefreshSessionRepository


@pytest.mark.anyio
async def test_get_by_token_hash_for_update_uses_row_lock() -> None:
    """Lock the selected refresh session for the duration of rotation."""
    session = AsyncMock()
    result = Mock()
    result.scalar_one_or_none.return_value = None
    session.execute.return_value = result
    repository = RefreshSessionRepository(session)

    await repository.get_by_token_hash_for_update("token-hash")

    statement = session.execute.await_args.args[0]
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in compiled
    assert "token_hash" in compiled


@pytest.mark.anyio
async def test_delete_returns_true_when_one_session_is_removed() -> None:
    """Report successful consumption of the refresh session."""
    session = AsyncMock()
    result = Mock(rowcount=1)
    session.execute.return_value = result
    repository = RefreshSessionRepository(session)

    assert await repository.delete(12) is True


@pytest.mark.anyio
async def test_delete_returns_false_when_session_is_already_missing() -> None:
    """Report when a refresh session was already consumed or removed."""
    session = AsyncMock()
    result = Mock(rowcount=0)
    session.execute.return_value = result
    repository = RefreshSessionRepository(session)

    assert await repository.delete(12) is False


@pytest.mark.anyio
async def test_touch_if_active_updates_last_activity() -> None:
    """Update the activity timestamp for a session inside the idle window."""
    session = AsyncMock()
    result = Mock()
    result.scalar_one_or_none.return_value = 12
    session.execute.return_value = result
    repository = RefreshSessionRepository(session)
    now = datetime.now(UTC)

    assert (
        await repository.touch_if_active(
            "token-hash",
            now,
            now - timedelta(minutes=15),
        )
        is True
    )

    statement = session.execute.await_args.args[0]
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "UPDATE refresh_sessions" in compiled
    assert "last_activity_at" in compiled
    assert "RETURNING" in compiled


@pytest.mark.anyio
async def test_touch_if_active_rejects_missing_or_idle_session() -> None:
    """Reject activity updates when the refresh session is not eligible."""
    session = AsyncMock()
    result = Mock()
    result.scalar_one_or_none.return_value = None
    session.execute.return_value = result
    repository = RefreshSessionRepository(session)
    now = datetime.now(UTC)

    assert (
        await repository.touch_if_active(
            "token-hash",
            now,
            now - timedelta(minutes=15),
        )
        is False
    )
