from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, Response, status
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import transactions as transaction_routes
from app.application.transactions.process_transaction import (
    InvalidIdempotencyKeyError,
    TransactionProcessingError,
)
from app.application.transactions.recover_transaction import RecoveryConflictError
from app.infrastructure.database.models.user import User
from app.infrastructure.repositories.transaction import (
    IdempotencyPersistenceConflictError,
)
from app.schemas.transaction import TransactionCreateRequest

VALID_IBAN = "DE89370400440532013000"
IDEMPOTENCY_KEY = "route-idempotency-001"  # gitleaks:allow  # noqa: E501


class FakePostgresError(Exception):
    """Represent a driver exception exposing SQLSTATE through a chosen field."""

    def __init__(
        self,
        *,
        sqlstate: str | None = None,
        pgcode: str | None = None,
        diag_sqlstate: str | None = None,
    ) -> None:
        super().__init__("Database operation failed")

        self.sqlstate = sqlstate
        self.pgcode = pgcode

        if diag_sqlstate is not None:
            self.diag = SimpleNamespace(sqlstate=diag_sqlstate)


def make_dbapi_error(original_error: Exception) -> DBAPIError:
    return DBAPIError("SELECT 1", {}, original_error)


def make_transaction(
    *,
    fingerprint: str = "a" * 64,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=123,
        created_at=datetime.now(UTC),
        source_account_id=10,
        destination_account_id=20,
        amount=Decimal("10.00"),
        transaction_type="TRANSFER",
        status="COMPLETED",
        reference=None,
        transfer_method="iban",
        request_fingerprint=fingerprint,
    )


def prepare_create_transaction_route(
    monkeypatch: pytest.MonkeyPatch,
):
    """Mock the durable recovery service used by the transaction endpoint."""
    session = AsyncMock(spec=AsyncSession)
    service = AsyncMock()
    operation = SimpleNamespace(
        status="COMPLETED",
        failure_code=None,
        idempotency_key=IDEMPOTENCY_KEY,
    )
    transaction = make_transaction(
        fingerprint=transaction_routes.TransactionProcessing.calculate_request_fingerprint(
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        )
    )

    service.get_status.return_value = ("NOT_FOUND", None, None)
    service.reserve.return_value = (operation, True)
    service.resume.return_value = ("COMPLETED", operation, transaction)

    monkeypatch.setattr(
        transaction_routes,
        "RecoverTransaction",
        lambda _session: service,
    )

    return session, service, operation, transaction


async def call_create_transaction(
    *,
    session: AsyncSession,
    response: Response | None = None,
):
    return await transaction_routes.create_transaction(
        transaction_data=TransactionCreateRequest(
            destination_iban=VALID_IBAN,
            amount=Decimal("10.00"),
        ),
        response=response or Response(),
        idempotency_key=IDEMPOTENCY_KEY,
        current_user=cast(User, SimpleNamespace(id=7)),
        session=session,
    )


@pytest.mark.parametrize(
    ("original_error", "expected_sqlstate"),
    [
        (
            FakePostgresError(sqlstate="40001", pgcode="40P01"),
            "40001",
        ),
        (
            FakePostgresError(pgcode="40P01"),
            "40P01",
        ),
        (
            FakePostgresError(diag_sqlstate="40001"),
            "40001",
        ),
        (
            FakePostgresError(),
            None,
        ),
    ],
)
def test_get_postgres_sqlstate_supports_driver_attribute_variants(
    original_error: Exception,
    expected_sqlstate: str | None,
) -> None:
    assert (
        transaction_routes._get_postgres_sqlstate(
            make_dbapi_error(original_error),
        )
        == expected_sqlstate
    )


@pytest.mark.parametrize(
    ("sqlstate", "expected"),
    [
        ("40001", True),
        ("40P01", True),
        ("23505", False),
        (None, False),
    ],
)
def test_retryability_only_matches_serialization_and_deadlock_errors(
    sqlstate: str | None,
    expected: bool,
) -> None:
    error = make_dbapi_error(
        FakePostgresError(sqlstate=sqlstate),
    )

    assert transaction_routes._is_retryable_transaction_error(error) is expected


@pytest.mark.anyio
async def test_safe_rollback_preserves_an_existing_error_when_rollback_fails() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.rollback.side_effect = RuntimeError("rollback unavailable")

    await transaction_routes._rollback_safely(session)

    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_retry_helper_propagates_retryable_error_when_rollback_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    processor = AsyncMock()

    database_error = make_dbapi_error(
        FakePostgresError(sqlstate="40001"),
    )
    processor.execute.side_effect = database_error

    session = AsyncMock(spec=AsyncSession)
    session.rollback.side_effect = RuntimeError("rollback unavailable")

    monkeypatch.setattr(
        transaction_routes.asyncio,
        "sleep",
        AsyncMock(),
    )

    with pytest.raises(DBAPIError) as exc_info:
        await transaction_routes._execute_transaction_with_retry(
            processor=processor,
            session=session,
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            idempotency_key=IDEMPOTENCY_KEY,
            reference=None,
        )

    assert exc_info.value is database_error
    processor.execute.assert_awaited_once()
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("scenario", "expected_status"),
    [
        ("missing_source_account", status.HTTP_409_CONFLICT),
        ("missing_existing_transaction", status.HTTP_409_CONFLICT),
        ("different_payload", status.HTTP_409_CONFLICT),
        ("same_payload", None),
    ],
)
async def test_resolves_database_idempotency_conflict_safely(
    scenario: str,
    expected_status: int | None,
) -> None:
    session = AsyncMock(spec=AsyncSession)

    account_repository = AsyncMock()
    transaction_repository = AsyncMock()

    original_error = IdempotencyPersistenceConflictError(
        "unique key conflict",
    )

    if scenario == "missing_source_account":
        account_repository.get_by_user_id.return_value = None
    else:
        account_repository.get_by_user_id.return_value = SimpleNamespace(
            id=10,
        )

    expected_fingerprint = (
        transaction_routes.TransactionProcessing.calculate_request_fingerprint(
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        )
    )

    if scenario == "missing_existing_transaction":
        transaction_repository.get_by_idempotency_key.return_value = None

    elif scenario == "different_payload":
        transaction_repository.get_by_idempotency_key.return_value = make_transaction(
            fingerprint="f" * 64
        )

    elif scenario == "same_payload":
        transaction_repository.get_by_idempotency_key.return_value = make_transaction(
            fingerprint=expected_fingerprint
        )

    operation = transaction_routes._resolve_idempotency_conflict(
        session=session,
        account_repository=account_repository,
        transaction_repository=transaction_repository,
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("10.00"),
        reference=None,
        original_error=original_error,
    )

    if expected_status is not None:
        with pytest.raises(HTTPException) as exc_info:
            await operation

        assert exc_info.value.status_code == expected_status

    else:
        result = await operation
        assert result.request_fingerprint == expected_fingerprint

    session.rollback.assert_awaited_once()

    if scenario == "missing_source_account":
        transaction_repository.get_by_idempotency_key.assert_not_awaited()

    else:
        transaction_repository.get_by_idempotency_key.assert_awaited_once_with(
            source_account_id=10,
            idempotency_key=IDEMPOTENCY_KEY,
        )


@pytest.mark.anyio
async def test_create_transaction_returns_completed_replay_without_reserving(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session, service, _operation, transaction = prepare_create_transaction_route(
        monkeypatch
    )
    service.get_status.return_value = ("COMPLETED", None, transaction)
    response = Response()

    result = await call_create_transaction(session=session, response=response)

    assert result.id == transaction.id
    assert response.status_code == status.HTTP_200_OK
    service.reserve.assert_not_awaited()
    service.resume.assert_not_awaited()


@pytest.mark.anyio
async def test_create_transaction_rejects_completed_key_with_different_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session, service, _operation, transaction = prepare_create_transaction_route(
        monkeypatch
    )
    transaction.request_fingerprint = "f" * 64
    service.get_status.return_value = ("COMPLETED", None, transaction)

    with pytest.raises(HTTPException) as exc_info:
        await call_create_transaction(session=session)

    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    service.reserve.assert_not_awaited()
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("error", "expected_status"),
    [
        (
            InvalidIdempotencyKeyError("bad key"),
            status.HTTP_400_BAD_REQUEST,
        ),
        (
            RecoveryConflictError("different payload"),
            status.HTTP_409_CONFLICT,
        ),
        (
            TransactionProcessingError("insufficient funds"),
            status.HTTP_400_BAD_REQUEST,
        ),
    ],
)
async def test_create_transaction_maps_processing_errors_and_rolls_back(
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    expected_status: int,
) -> None:
    session, service, _operation, _transaction = prepare_create_transaction_route(
        monkeypatch
    )
    service.reserve.side_effect = error

    with pytest.raises(HTTPException) as exc_info:
        await call_create_transaction(session=session)

    assert exc_info.value.status_code == expected_status
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_create_transaction_recovers_matching_concurrent_insert_as_replay(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session, service, operation, existing_transaction = (
        prepare_create_transaction_route(monkeypatch)
    )
    service.reserve.return_value = (operation, False)
    service.resume.return_value = ("COMPLETED", operation, existing_transaction)

    response = Response()
    result = await call_create_transaction(session=session, response=response)

    assert result.id == existing_transaction.id
    assert response.status_code == status.HTTP_200_OK
    service.reserve.assert_awaited_once()
    service.resume.assert_awaited_once_with(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
    )


@pytest.mark.anyio
async def test_create_transaction_rolls_back_when_concurrent_replay_cannot_be_resolved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session, service, _operation, _transaction = prepare_create_transaction_route(
        monkeypatch
    )
    service.reserve.side_effect = RecoveryConflictError("unresolved")

    with pytest.raises(HTTPException) as exc_info:
        await call_create_transaction(session=session)

    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    assert exc_info.value.detail == "unresolved"
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_create_transaction_rolls_back_and_propagates_unexpected_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session, service, _operation, _transaction = prepare_create_transaction_route(
        monkeypatch
    )

    unexpected_error = RuntimeError("unexpected persistence failure")
    service.get_status.side_effect = unexpected_error

    with pytest.raises(
        RuntimeError,
        match="unexpected persistence failure",
    ) as exc_info:
        await call_create_transaction(session=session)

    assert exc_info.value is unexpected_error
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("was_replay", "expected_status"),
    [
        (False, status.HTTP_201_CREATED),
        (True, status.HTTP_200_OK),
    ],
)
async def test_create_transaction_uses_created_or_replay_status(
    monkeypatch: pytest.MonkeyPatch,
    was_replay: bool,
    expected_status: int,
) -> None:
    session, service, operation, transaction = prepare_create_transaction_route(
        monkeypatch
    )
    service.reserve.return_value = (operation, not was_replay)
    service.resume.return_value = ("COMPLETED", operation, transaction)

    response = Response()

    result = await call_create_transaction(
        session=session,
        response=response,
    )

    assert result.id == transaction.id
    assert response.status_code == expected_status


@pytest.mark.anyio
async def test_retry_helper_retries_commit_conflict_with_same_idempotency_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Retry a known transient commit failure without changing request identity."""
    transaction = make_transaction()
    processor = AsyncMock()
    processor.execute.return_value = transaction

    session = AsyncMock(spec=AsyncSession)
    session.commit.side_effect = [
        make_dbapi_error(FakePostgresError(sqlstate="40001")),
        None,
    ]

    sleep = AsyncMock()
    monkeypatch.setattr(transaction_routes.asyncio, "sleep", sleep)

    result = await transaction_routes._execute_transaction_with_retry(
        processor=processor,
        session=session,
        user_id=7,
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("10.00"),
        idempotency_key=IDEMPOTENCY_KEY,
        reference=None,
    )

    assert result is transaction
    assert processor.execute.await_count == 2
    assert all(
        call.kwargs["idempotency_key"] == IDEMPOTENCY_KEY
        for call in processor.execute.await_args_list
    )
    assert session.commit.await_count == 2
    session.rollback.assert_awaited_once()
    sleep.assert_awaited_once_with(transaction_routes.TRANSACTION_RETRY_DELAY_SECONDS)


@pytest.mark.anyio
async def test_resume_retry_retries_transient_error_and_returns_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recovery = AsyncMock()
    expected = ("COMPLETED", SimpleNamespace(id=1), SimpleNamespace(id=123))
    recovery.resume.side_effect = [
        make_dbapi_error(FakePostgresError(sqlstate="40001")),
        expected,
    ]
    session = AsyncMock(spec=AsyncSession)
    sleep = AsyncMock()
    monkeypatch.setattr(transaction_routes.asyncio, "sleep", sleep)

    result = await transaction_routes._resume_transaction_with_retry(
        service=recovery,
        session=session,
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
    )

    assert result == expected
    assert recovery.resume.await_count == 2
    session.rollback.assert_awaited_once()
    sleep.assert_awaited_once_with(transaction_routes.TRANSACTION_RETRY_DELAY_SECONDS)


@pytest.mark.anyio
async def test_resume_retry_exhaustion_returns_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recovery = AsyncMock()
    recovery.resume.side_effect = make_dbapi_error(FakePostgresError(sqlstate="40P01"))
    session = AsyncMock(spec=AsyncSession)
    sleep = AsyncMock()
    monkeypatch.setattr(transaction_routes.asyncio, "sleep", sleep)

    with pytest.raises(HTTPException) as exc_info:
        await transaction_routes._resume_transaction_with_retry(
            service=recovery,
            session=session,
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
        )

    assert exc_info.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert exc_info.value.headers == {"Retry-After": "1"}
    assert recovery.resume.await_count == transaction_routes.MAX_TRANSACTION_ATTEMPTS
    assert session.rollback.await_count == transaction_routes.MAX_TRANSACTION_ATTEMPTS


@pytest.mark.anyio
async def test_resume_retry_does_not_retry_unrecognized_database_error() -> None:
    recovery = AsyncMock()
    error = make_dbapi_error(FakePostgresError(sqlstate="23505"))
    recovery.resume.side_effect = error
    session = AsyncMock(spec=AsyncSession)

    with pytest.raises(DBAPIError) as exc_info:
        await transaction_routes._resume_transaction_with_retry(
            service=recovery,
            session=session,
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
        )

    assert exc_info.value is error
    recovery.resume.assert_awaited_once()
    session.rollback.assert_not_awaited()


@pytest.mark.anyio
async def test_resume_retry_propagates_original_error_when_rollback_fails() -> None:
    recovery = AsyncMock()
    error = make_dbapi_error(FakePostgresError(sqlstate="40001"))
    recovery.resume.side_effect = error
    session = AsyncMock(spec=AsyncSession)
    session.rollback.side_effect = RuntimeError("rollback failed")

    with pytest.raises(DBAPIError) as exc_info:
        await transaction_routes._resume_transaction_with_retry(
            service=recovery,
            session=session,
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
        )

    assert exc_info.value is error
    recovery.resume.assert_awaited_once()
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_create_transaction_reports_durable_failed_operation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session, service, operation, _transaction = prepare_create_transaction_route(
        monkeypatch
    )
    operation.failure_code = "INSUFFICIENT_FUNDS"
    service.resume.return_value = ("FAILED", operation, None)

    with pytest.raises(HTTPException) as exc_info:
        await call_create_transaction(session=session)

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "INSUFFICIENT_FUNDS" in exc_info.value.detail


@pytest.mark.anyio
async def test_create_transaction_returns_503_for_reserved_operation_without_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session, service, operation, _transaction = prepare_create_transaction_route(
        monkeypatch
    )
    operation.status = "PROCESSING"
    service.resume.return_value = ("PROCESSING", operation, None)

    with pytest.raises(HTTPException) as exc_info:
        await call_create_transaction(session=session)

    assert exc_info.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert exc_info.value.headers == {"Retry-After": "1"}
