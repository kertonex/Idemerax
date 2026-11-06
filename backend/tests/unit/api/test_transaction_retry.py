from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, Response, status
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import transactions as routes
from app.application.transactions.process_transaction import TransactionProcessing
from app.application.transactions.recover_transaction import (
    RecoveryNotFoundError,
)
from app.infrastructure.database.models.transaction import Transaction
from app.infrastructure.database.models.user import User
from app.infrastructure.repositories.transaction import (
    IdempotencyPersistenceConflictError,
)

VALID_IBAN = "DE89370400440532013000"
IDEMPOTENCY_KEY = "coverage-route-edge-001"


class FakePostgresError(Exception):
    def __init__(self, sqlstate: str | None = None, pgcode: str | None = None):
        super().__init__("simulated postgres error")
        self.sqlstate = sqlstate
        self.pgcode = pgcode


def make_dbapi_error(sqlstate: str) -> DBAPIError:
    return DBAPIError("SELECT 1", {}, FakePostgresError(sqlstate=sqlstate))


def make_transaction(*, fingerprint: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=123,
        created_at=datetime.now(UTC),
        source_account_id=10,
        destination_account_id=20,
        amount=Decimal("10.00"),
        transaction_type="TRANSFER",
        status="COMPLETED",
        reference="Invoice 1",
        transfer_method="iban",
        request_fingerprint=fingerprint
        or TransactionProcessing.calculate_request_fingerprint(
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference="Invoice 1",
        ),
    )


def make_history_transaction(
    *,
    source_first: str | None = "Ada",
    source_last: str | None = "Lovelace",
    destination_first: str | None = "Grace",
    destination_last: str | None = "Hopper",
    transfer_method: str | None = "iban",
) -> SimpleNamespace:
    source_user = SimpleNamespace(
        first_name=source_first,
        last_name=source_last,
        email="source@example.com",
    )
    destination_user = SimpleNamespace(
        first_name=destination_first,
        last_name=destination_last,
        email="destination@example.com",
    )
    source_account = SimpleNamespace(iban="DE11111111111111111111", user=source_user)
    destination_account = SimpleNamespace(
        iban="DE22222222222222222222",
        user=destination_user,
    )
    return SimpleNamespace(
        id=123,
        created_at=datetime.now(UTC),
        source_account_id=10,
        destination_account_id=20,
        amount=Decimal("10.00"),
        transaction_type="TRANSFER",
        status="COMPLETED",
        reference=None,
        transfer_method=transfer_method,
        source_account=source_account,
        destination_account=destination_account,
    )


@pytest.mark.parametrize(
    ("driver_error", "expected"),
    [
        (FakePostgresError(sqlstate="40001"), "40001"),
        (FakePostgresError(pgcode="40P01"), "40P01"),
        (SimpleNamespace(diag=SimpleNamespace(sqlstate="40001")), "40001"),
        (SimpleNamespace(), None),
    ],
)
def test_postgres_sqlstate_fallback_variants(
    driver_error: Exception,
    expected: str | None,
) -> None:
    error = DBAPIError("SELECT 1", {}, driver_error)
    assert routes._get_postgres_sqlstate(error) == expected


@pytest.mark.anyio
async def test_safe_rollback_does_not_raise_when_rollback_fails() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.rollback.side_effect = RuntimeError("rollback failure")

    await routes._rollback_safely(session)

    session.rollback.assert_awaited_once()


@pytest.mark.parametrize(
    ("direction", "expected_name", "expected_email", "expected_iban"),
    [
        (
            "outgoing",
            "Grace Hopper",
            "destination@example.com",
            "DE22222222222222222222",
        ),
        (
            "incoming",
            "Ada Lovelace",
            "source@example.com",
            "DE11111111111111111111",
        ),
    ],
)
def test_transaction_history_item_maps_counterparty_fields(
    direction: str,
    expected_name: str,
    expected_email: str,
    expected_iban: str,
) -> None:
    result = routes._to_transaction_history_item(
        cast(Transaction, make_history_transaction()),
        direction,  # type: ignore[arg-type]
    )

    assert result.counterparty_name == expected_name
    assert result.counterparty_email == expected_email
    assert result.counterparty_iban == expected_iban


def test_transaction_history_item_uses_none_for_blank_name_and_unknown_method() -> None:
    transaction = make_history_transaction(
        destination_first=" ",
        destination_last=None,
        transfer_method="unknown",
    )

    result = routes._to_transaction_history_item(
        cast(Transaction, transaction), "outgoing"
    )

    assert result.counterparty_name is None
    assert result.transfer_method is None


@pytest.mark.anyio
async def test_execute_transaction_with_retry_commits_success() -> None:
    processor = AsyncMock()
    transaction = make_transaction()
    processor.execute.return_value = transaction
    session = AsyncMock(spec=AsyncSession)

    result = await routes._execute_transaction_with_retry(
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
    processor.execute.assert_awaited_once_with(
        user_id=7,
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("10.00"),
        idempotency_key=IDEMPOTENCY_KEY,
        reference=None,
    )
    session.commit.assert_awaited_once()
    session.rollback.assert_not_awaited()


@pytest.mark.anyio
async def test_execute_transaction_with_retry_retries_transient_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    processor = AsyncMock()
    transaction = make_transaction()
    processor.execute.side_effect = [make_dbapi_error("40001"), transaction]
    session = AsyncMock(spec=AsyncSession)
    sleep = AsyncMock()
    monkeypatch.setattr(routes.asyncio, "sleep", sleep)

    result = await routes._execute_transaction_with_retry(
        processor=processor,
        session=session,
        user_id=7,
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("10.00"),
        idempotency_key=IDEMPOTENCY_KEY,
        reference="retry",
    )

    assert result is transaction
    assert processor.execute.await_count == 2
    assert (
        processor.execute.await_args_list[0].kwargs
        == processor.execute.await_args_list[1].kwargs
    )
    session.rollback.assert_awaited_once()
    session.commit.assert_awaited_once()
    sleep.assert_awaited_once_with(routes.TRANSACTION_RETRY_DELAY_SECONDS)


@pytest.mark.anyio
async def test_execute_transaction_with_retry_returns_503_after_exhaustion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    processor = AsyncMock()
    processor.execute.side_effect = [
        make_dbapi_error("40P01"),
        make_dbapi_error("40P01"),
    ]
    session = AsyncMock(spec=AsyncSession)
    sleep = AsyncMock()
    monkeypatch.setattr(routes.asyncio, "sleep", sleep)

    with pytest.raises(HTTPException) as exc_info:
        await routes._execute_transaction_with_retry(
            processor=processor,
            session=session,
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            idempotency_key=IDEMPOTENCY_KEY,
            reference=None,
        )

    assert exc_info.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert exc_info.value.headers == {"Retry-After": "1"}
    assert processor.execute.await_count == routes.MAX_TRANSACTION_ATTEMPTS
    assert session.rollback.await_count == routes.MAX_TRANSACTION_ATTEMPTS
    sleep.assert_awaited_once()


@pytest.mark.anyio
async def test_execute_transaction_with_retry_does_not_retry_unknown_sqlstate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    processor = AsyncMock()
    error = make_dbapi_error("23505")
    processor.execute.side_effect = error
    session = AsyncMock(spec=AsyncSession)
    sleep = AsyncMock()
    monkeypatch.setattr(routes.asyncio, "sleep", sleep)

    with pytest.raises(DBAPIError) as exc_info:
        await routes._execute_transaction_with_retry(
            processor=processor,
            session=session,
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            idempotency_key=IDEMPOTENCY_KEY,
            reference=None,
        )

    assert exc_info.value is error
    processor.execute.assert_awaited_once()
    session.rollback.assert_not_awaited()
    sleep.assert_not_awaited()


@pytest.mark.anyio
async def test_execute_transaction_with_retry_propagates_error_when_rollback_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    processor = AsyncMock()
    error = make_dbapi_error("40001")
    processor.execute.side_effect = error
    session = AsyncMock(spec=AsyncSession)
    session.rollback.side_effect = RuntimeError("rollback failure")
    sleep = AsyncMock()
    monkeypatch.setattr(routes.asyncio, "sleep", sleep)

    with pytest.raises(DBAPIError) as exc_info:
        await routes._execute_transaction_with_retry(
            processor=processor,
            session=session,
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            idempotency_key=IDEMPOTENCY_KEY,
            reference=None,
        )

    assert exc_info.value is error
    session.rollback.assert_awaited_once()
    sleep.assert_not_awaited()


@pytest.mark.anyio
async def test_execute_transaction_with_retry_reports_unexpected_empty_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    processor = AsyncMock()
    session = AsyncMock(spec=AsyncSession)
    monkeypatch.setattr(routes, "MAX_TRANSACTION_ATTEMPTS", 0)

    with pytest.raises(
        RuntimeError, match="Transaction retry loop exited unexpectedly"
    ):
        await routes._execute_transaction_with_retry(
            processor=processor,
            session=session,
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            idempotency_key=IDEMPOTENCY_KEY,
            reference=None,
        )

    processor.execute.assert_not_awaited()


@pytest.mark.anyio
async def test_resolve_idempotency_conflict_returns_matching_transaction() -> None:
    session = AsyncMock(spec=AsyncSession)
    account_repository = AsyncMock()
    transaction_repository = AsyncMock()
    source = SimpleNamespace(id=10)
    transaction = make_transaction()
    account_repository.get_by_user_id.return_value = source
    transaction_repository.get_by_idempotency_key.return_value = transaction

    result = await routes._resolve_idempotency_conflict(
        session=session,
        account_repository=account_repository,
        transaction_repository=transaction_repository,
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("10.00"),
        reference="Invoice 1",
        original_error=IdempotencyPersistenceConflictError("duplicate"),
    )

    assert result is transaction
    session.rollback.assert_awaited_once()
    account_repository.get_by_user_id.assert_awaited_once_with(user_id=7)
    transaction_repository.get_by_idempotency_key.assert_awaited_once_with(
        source_account_id=10,
        idempotency_key=IDEMPOTENCY_KEY,
    )


@pytest.mark.anyio
@pytest.mark.parametrize(
    "failure",
    ["missing-source", "missing-transaction", "different-payload"],
)
async def test_resolve_idempotency_conflict_maps_unresolvable_conflicts_to_409(
    failure: str,
) -> None:
    session = AsyncMock(spec=AsyncSession)
    account_repository = AsyncMock()
    transaction_repository = AsyncMock()
    original_error = IdempotencyPersistenceConflictError("duplicate")

    if failure == "missing-source":
        account_repository.get_by_user_id.return_value = None
    else:
        account_repository.get_by_user_id.return_value = SimpleNamespace(id=10)
        if failure == "missing-transaction":
            transaction_repository.get_by_idempotency_key.return_value = None
        else:
            existing = make_transaction(fingerprint="f" * 64)
            transaction_repository.get_by_idempotency_key.return_value = existing

    with pytest.raises(HTTPException) as exc_info:
        await routes._resolve_idempotency_conflict(
            session=session,
            account_repository=account_repository,
            transaction_repository=transaction_repository,
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference="Invoice 1",
            original_error=original_error,
        )

    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    assert exc_info.value.__cause__ is original_error
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_pending_recovery_endpoint_returns_none_when_no_operation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = AsyncMock()
    service.get_pending.return_value = None
    monkeypatch.setattr(routes, "RecoverTransaction", lambda _session: service)

    result = await routes.get_pending_transaction_recovery(
        current_user=cast(User, SimpleNamespace(id=7)),
        session=AsyncMock(spec=AsyncSession),
    )

    assert result == {"operation": None}
    service.get_pending.assert_awaited_once_with(7)


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("method", "expected_iban", "expected_email"),
    [
        ("iban", "DE22222222222222222222", None),
        ("email", None, "destination@example.com"),
    ],
)
async def test_pending_recovery_endpoint_serializes_recipient_method(
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    expected_iban: str | None,
    expected_email: str | None,
) -> None:
    service = AsyncMock()
    operation = SimpleNamespace(
        idempotency_key=IDEMPOTENCY_KEY,
        status="PROCESSING",
        created_at=datetime(2026, 11, 2, tzinfo=UTC),
        transfer_method=method,
        amount=Decimal("12.50"),
        reference="Payment",
        failure_code=None,
    )
    destination = SimpleNamespace(
        iban="DE22222222222222222222",
        user=SimpleNamespace(email="destination@example.com"),
    )
    service.get_pending.return_value = (operation, destination)
    monkeypatch.setattr(routes, "RecoverTransaction", lambda _session: service)

    result = await routes.get_pending_transaction_recovery(
        current_user=cast(User, SimpleNamespace(id=7)),
        session=AsyncMock(spec=AsyncSession),
    )

    result_payload = cast(dict[str, Any], result)
    payload = cast(dict[str, Any], result_payload["operation"])
    assert payload["idempotency_key"] == IDEMPOTENCY_KEY
    assert payload["status"] == "PROCESSING"
    assert payload["created_at"] == "2026-11-02T00:00:00+00:00"
    assert payload["recipient_method"] == method
    assert payload["recipient_iban"] == expected_iban
    assert payload["recipient_email"] == expected_email
    assert payload["amount"] == "12.50"
    assert payload["reference"] == "Payment"


@pytest.mark.anyio
async def test_idempotency_status_endpoint_serializes_transaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = AsyncMock()
    transaction = make_transaction()
    operation = SimpleNamespace(failure_code=None)
    service.get_status.return_value = ("COMPLETED", operation, transaction)
    monkeypatch.setattr(routes, "RecoverTransaction", lambda _session: service)

    result = await routes.get_transaction_idempotency_status(
        idempotency_key=IDEMPOTENCY_KEY,
        current_user=cast(User, SimpleNamespace(id=7)),
        session=AsyncMock(spec=AsyncSession),
    )

    payload = cast(dict[str, Any], result)
    transaction_payload = cast(dict[str, Any], payload["transaction"])
    assert payload["status"] == "COMPLETED"
    assert payload["failure_code"] is None
    assert transaction_payload["id"] == transaction.id


@pytest.mark.anyio
async def test_idempotency_status_endpoint_returns_null_transaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = AsyncMock()
    operation = SimpleNamespace(failure_code="INSUFFICIENT_FUNDS")
    service.get_status.return_value = ("FAILED", operation, None)
    monkeypatch.setattr(routes, "RecoverTransaction", lambda _session: service)

    result = await routes.get_transaction_idempotency_status(
        idempotency_key=IDEMPOTENCY_KEY,
        current_user=cast(User, SimpleNamespace(id=7)),
        session=AsyncMock(spec=AsyncSession),
    )

    assert result == {
        "status": "FAILED",
        "failure_code": "INSUFFICIENT_FUNDS",
        "transaction": None,
    }


@pytest.mark.anyio
async def test_resume_endpoint_maps_missing_operation_to_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = AsyncMock()
    service.resume.side_effect = RecoveryNotFoundError()
    monkeypatch.setattr(routes, "RecoverTransaction", lambda _session: service)

    with pytest.raises(HTTPException) as exc_info:
        await routes.resume_transaction_recovery(
            idempotency_key=IDEMPOTENCY_KEY,
            current_user=cast(User, SimpleNamespace(id=7)),
            session=AsyncMock(spec=AsyncSession),
        )

    assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.anyio
async def test_resume_endpoint_serializes_operation_with_completed_transaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = AsyncMock()
    operation = SimpleNamespace(failure_code=None)
    transaction = make_transaction()
    service.resume.return_value = ("COMPLETED", operation, transaction)
    monkeypatch.setattr(routes, "RecoverTransaction", lambda _session: service)

    result = await routes.resume_transaction_recovery(
        idempotency_key=IDEMPOTENCY_KEY,
        current_user=cast(User, SimpleNamespace(id=7)),
        session=AsyncMock(spec=AsyncSession),
    )

    payload = cast(dict[str, Any], result)
    transaction_payload = cast(dict[str, Any], payload["transaction"])
    assert payload["status"] == "COMPLETED"
    assert transaction_payload["id"] == transaction.id


@pytest.mark.anyio
async def test_resume_endpoint_serializes_pending_operation_without_transaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = AsyncMock()
    operation = SimpleNamespace(failure_code=None)
    service.resume.return_value = ("PROCESSING", operation, None)
    monkeypatch.setattr(routes, "RecoverTransaction", lambda _session: service)

    result = await routes.resume_transaction_recovery(
        idempotency_key=IDEMPOTENCY_KEY,
        current_user=cast(User, SimpleNamespace(id=7)),
        session=AsyncMock(spec=AsyncSession),
    )

    assert result == {
        "status": "PROCESSING",
        "failure_code": None,
        "transaction": None,
    }


@pytest.mark.anyio
async def test_transaction_history_endpoint_serializes_empty_page(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = AsyncMock()
    repository.list_for_user.return_value = ([], 0)
    monkeypatch.setattr(routes, "TransactionRepository", lambda _session: repository)

    result = await routes.get_transaction_history(
        limit=15,
        offset=5,
        current_user=cast(User, SimpleNamespace(id=7)),
        session=AsyncMock(spec=AsyncSession),
    )

    assert result.items == []
    assert result.total == 0
    assert result.limit == 15
    assert result.offset == 5
    repository.list_for_user.assert_awaited_once_with(user_id=7, limit=15, offset=5)


@pytest.mark.anyio
async def test_create_transaction_handles_completed_email_replay(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = AsyncMock()
    email = "recipient@example.com"
    transaction = make_transaction(
        fingerprint=TransactionProcessing.calculate_request_fingerprint(
            destination_iban=None,
            destination_email=email,
            amount=Decimal("10.00"),
            reference=None,
        )
    )
    service.get_status.return_value = ("COMPLETED", None, transaction)
    monkeypatch.setattr(routes, "RecoverTransaction", lambda _session: service)
    response = Response()

    result = await routes.create_transaction(
        transaction_data=routes.TransactionCreateRequest(
            destination_email=email,
            amount=Decimal("10.00"),
            reference=None,
        ),
        response=response,
        idempotency_key=IDEMPOTENCY_KEY,
        current_user=cast(User, SimpleNamespace(id=7)),
        session=AsyncMock(spec=AsyncSession),
    )

    assert result.id == transaction.id
    assert response.status_code == status.HTTP_200_OK
    service.reserve.assert_not_awaited()


@pytest.mark.anyio
async def test_create_transaction_rolls_back_completed_email_payload_conflict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = AsyncMock()
    transaction = make_transaction(fingerprint="f" * 64)
    service.get_status.return_value = ("COMPLETED", None, transaction)
    monkeypatch.setattr(routes, "RecoverTransaction", lambda _session: service)
    session = AsyncMock(spec=AsyncSession)

    with pytest.raises(HTTPException) as exc_info:
        await routes.create_transaction(
            transaction_data=routes.TransactionCreateRequest(
                destination_email="recipient@example.com",
                amount=Decimal("10.00"),
                reference=None,
            ),
            response=Response(),
            idempotency_key=IDEMPOTENCY_KEY,
            current_user=cast(User, SimpleNamespace(id=7)),
            session=session,
        )

    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_resume_transaction_with_retry_reports_unexpected_empty_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = AsyncMock()
    session = AsyncMock(spec=AsyncSession)
    monkeypatch.setattr(routes, "MAX_TRANSACTION_ATTEMPTS", 0)

    with pytest.raises(
        RuntimeError,
        match="Transaction recovery retry loop exited unexpectedly",
    ):
        await cast(Any, routes)._resume_transaction_with_retry(
            service=service,
            session=session,
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
        )

    service.resume.assert_not_awaited()


@pytest.mark.anyio
async def test_identify_iban_bank_details_returns_bank_information(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = AsyncMock()
    monkeypatch.setattr(
        routes,
        "FinancialInstitutionRepository",
        lambda _session: repository,
    )
    monkeypatch.setattr(
        routes,
        "identify_iban_bank",
        AsyncMock(
            return_value=SimpleNamespace(
                bank_code="37040044",
                bank_name="Idemerax",
                bic="IDEMDEFFXXX",
            )
        ),
    )

    result = await routes.identify_iban_bank_details(
        iban=VALID_IBAN,
        current_user=cast(User, SimpleNamespace(id=7)),
        session=AsyncMock(spec=AsyncSession),
    )

    assert result.bank_code == "37040044"
    assert result.bank_name == "Idemerax"
    assert result.bic == "IDEMDEFFXXX"


@pytest.mark.anyio
async def test_identify_iban_bank_details_maps_identification_error_to_400(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        routes,
        "FinancialInstitutionRepository",
        lambda _session: AsyncMock(),
    )
    identify = AsyncMock(side_effect=routes.IbanBankIdentificationError("invalid IBAN"))
    monkeypatch.setattr(routes, "identify_iban_bank", identify)

    with pytest.raises(HTTPException) as exc_info:
        await routes.identify_iban_bank_details(
            iban="invalid",
            current_user=cast(User, SimpleNamespace(id=7)),
            session=AsyncMock(spec=AsyncSession),
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail == "invalid IBAN"
