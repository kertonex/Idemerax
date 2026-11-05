from decimal import Decimal
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.transactions.process_transaction import (
    TransactionProcessing,
    TransactionProcessingError,
)
from app.application.transactions.recover_transaction import (
    RecoverTransaction,
    RecoveryConflictError,
    RecoveryNotFoundError,
)
from app.infrastructure.database.models.transaction_recovery import TransactionRecovery

VALID_IBAN = "DE89370400440532013000"
IDEMPOTENCY_KEY = "recovery-unit-test-001"


class FakeDatabaseErrorWithDiag(Exception):
    """Simulate a driver exception exposing diagnostic constraint details."""

    def __init__(self, constraint_name: str) -> None:
        super().__init__("Simulated database integrity error")
        self.diag = SimpleNamespace(constraint_name=constraint_name)


class FakeDatabaseErrorWithConstraint(Exception):
    """Simulate a driver exception exposing a direct constraint attribute."""

    def __init__(self, constraint_name: str) -> None:
        super().__init__("Simulated database integrity error")
        self.constraint_name = constraint_name


def make_operation(
    *,
    status: str = "PROCESSING",
    fingerprint: str | None = None,
    transaction_id: int | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        source_account_id=10,
        destination_account_id=20,
        idempotency_key=IDEMPOTENCY_KEY,
        request_fingerprint=fingerprint
        or TransactionProcessing.calculate_request_fingerprint(
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        ),
        amount=Decimal("10.00"),
        reference=None,
        transfer_method="iban",
        status=status,
        transaction_id=transaction_id,
        failure_code=None,
    )


def make_transaction() -> SimpleNamespace:
    return SimpleNamespace(id=99)


def make_integrity_error(constraint_name: str) -> IntegrityError:
    original_error = FakeDatabaseErrorWithDiag(constraint_name)
    return IntegrityError(
        "INSERT INTO transaction_recovery",
        {},
        original_error,
    )


@pytest.fixture
def recovery_dependencies(monkeypatch: pytest.MonkeyPatch):
    accounts = AsyncMock()
    users = AsyncMock()
    transactions = AsyncMock()
    recovery = AsyncMock()
    session = AsyncMock(spec=AsyncSession)

    monkeypatch.setattr(
        "app.application.transactions.recover_transaction.AccountRepository",
        lambda _session: accounts,
    )
    monkeypatch.setattr(
        "app.application.transactions.recover_transaction.UserRepository",
        lambda _session: users,
    )
    monkeypatch.setattr(
        "app.application.transactions.recover_transaction.TransactionRepository",
        lambda _session: transactions,
    )
    monkeypatch.setattr(
        (
            "app.application.transactions.recover_transaction."
            "TransactionRecoveryRepository"
        ),
        lambda _session: recovery,
    )

    service = RecoverTransaction(session)
    return service, session, accounts, users, transactions, recovery


@pytest.mark.anyio
async def test_reserve_persists_normalized_iban_transfer_before_execution(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, _transactions, recovery = recovery_dependencies
    source = SimpleNamespace(id=10)
    destination = SimpleNamespace(id=20)
    accounts.get_by_user_id.return_value = source
    accounts.get_by_iban.return_value = destination
    recovery.get_by_key.return_value = None

    operation, created = await service.reserve(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
        destination_iban=" de89 3704 0044 0532 0130 00 ",
        destination_email=None,
        amount=Decimal("10.0000"),
        reference="  invoice  ",
    )

    assert created is True
    assert operation.source_account_id == source.id
    assert operation.destination_account_id == destination.id
    assert operation.idempotency_key == IDEMPOTENCY_KEY
    assert operation.request_fingerprint == (
        TransactionProcessing.calculate_request_fingerprint(
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.0000"),
            reference="invoice",
        )
    )
    assert operation.amount == Decimal("10.0000")
    assert operation.reference == "invoice"
    assert operation.transfer_method == "iban"
    assert operation.status == "PROCESSING"

    accounts.get_by_iban.assert_awaited_once_with(iban=VALID_IBAN)
    recovery.create.assert_awaited_once_with(operation)
    session.commit.assert_awaited_once()


@pytest.mark.anyio
async def test_reserve_replays_existing_operation_before_resolving_recipient(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, _transactions, recovery = recovery_dependencies
    source = SimpleNamespace(id=10)
    fingerprint = TransactionProcessing.calculate_request_fingerprint(
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("10.00"),
        reference=None,
    )
    existing = make_operation(fingerprint=fingerprint)
    accounts.get_by_user_id.return_value = source
    recovery.get_by_key.return_value = existing

    operation, created = await service.reserve(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("10.00"),
        reference=None,
    )

    assert operation is existing
    assert created is False
    accounts.get_by_iban.assert_not_awaited()
    recovery.create.assert_not_awaited()
    session.commit.assert_not_awaited()


@pytest.mark.anyio
async def test_reserve_rejects_payload_conflict_before_recipient_lookup(
    recovery_dependencies,
) -> None:
    service, _session, accounts, _users, _transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = SimpleNamespace(id=10)
    recovery.get_by_key.return_value = make_operation()

    with pytest.raises(RecoveryConflictError, match="different request"):
        await service.reserve(
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("11.00"),
            reference=None,
        )

    accounts.get_by_iban.assert_not_awaited()
    recovery.create.assert_not_awaited()


@pytest.mark.anyio
async def test_reserve_returns_existing_operation_when_recipient_is_now_inactive(
    recovery_dependencies,
) -> None:
    """A retry uses the durable snapshot, not mutable recipient state."""
    service, _session, accounts, users, _transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = SimpleNamespace(id=10)
    fingerprint = TransactionProcessing.calculate_request_fingerprint(
        destination_iban=None,
        destination_email="recipient@example.com",
        amount=Decimal("10.00"),
        reference=None,
    )
    existing = make_operation(fingerprint=fingerprint)
    recovery.get_by_key.return_value = existing

    operation, created = await service.reserve(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
        destination_iban=None,
        destination_email=" RECIPIENT@EXAMPLE.COM ",
        amount=Decimal("10.00"),
        reference=None,
    )

    assert operation is existing
    assert created is False
    users.get_by_email.assert_not_awaited()


@pytest.mark.anyio
async def test_reserve_supports_email_destination_and_normalizes_email(
    recovery_dependencies,
) -> None:
    service, session, accounts, users, _transactions, recovery = recovery_dependencies
    source = SimpleNamespace(id=10)
    destination = SimpleNamespace(id=20)
    recipient = SimpleNamespace(id=8, is_active=True)
    accounts.get_by_user_id.side_effect = [source, destination]
    users.get_by_email.return_value = recipient
    recovery.get_by_key.return_value = None

    operation, created = await service.reserve(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
        destination_iban=None,
        destination_email=" RECIPIENT@EXAMPLE.COM ",
        amount=Decimal("10.00"),
        reference=None,
    )

    assert created is True
    assert operation.transfer_method == "email"
    users.get_by_email.assert_awaited_once_with("recipient@example.com")
    assert accounts.get_by_user_id.await_args_list[1].kwargs == {"user_id": 8}
    session.commit.assert_awaited_once()


@pytest.mark.anyio
async def test_reserve_rejects_missing_source_account(recovery_dependencies) -> None:
    service, _session, accounts, _users, _transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = None

    with pytest.raises(
        TransactionProcessingError,
        match="Source financial account not found",
    ):
        await service.reserve(
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        )

    recovery.get_by_key.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("key", "iban", "email", "amount", "message"),
    [
        ("bad key", VALID_IBAN, None, Decimal("10.00"), "Invalid Idempotency-Key"),
        (IDEMPOTENCY_KEY, None, None, Decimal("10.00"), "Exactly one destination"),
        (
            IDEMPOTENCY_KEY,
            VALID_IBAN,
            "recipient@example.com",
            Decimal("10.00"),
            "Exactly one destination",
        ),
        (IDEMPOTENCY_KEY, "   ", None, Decimal("10.00"), "Invalid destination IBAN"),
        (
            IDEMPOTENCY_KEY,
            None,
            "   ",
            Decimal("10.00"),
            "Destination email must not be empty",
        ),
        (IDEMPOTENCY_KEY, VALID_IBAN, None, Decimal("0"), "greater than zero"),
    ],
)
async def test_reserve_rejects_invalid_request_before_database_writes(
    recovery_dependencies,
    key: str,
    iban: str | None,
    email: str | None,
    amount: Decimal,
    message: str,
) -> None:
    service, session, accounts, _users, _transactions, recovery = recovery_dependencies

    with pytest.raises(TransactionProcessingError, match=message):
        await service.reserve(
            user_id=7,
            idempotency_key=key,
            destination_iban=iban,
            destination_email=email,
            amount=amount,
            reference=None,
        )

    accounts.get_by_user_id.assert_not_awaited()
    recovery.create.assert_not_awaited()
    session.commit.assert_not_awaited()


@pytest.mark.anyio
async def test_reserve_rejects_inactive_email_recipient(recovery_dependencies) -> None:
    service, session, accounts, users, _transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = SimpleNamespace(id=10)
    recovery.get_by_key.return_value = None
    users.get_by_email.return_value = SimpleNamespace(id=8, is_active=False)

    with pytest.raises(TransactionProcessingError, match="Destination user not found"):
        await service.reserve(
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
            destination_iban=None,
            destination_email="recipient@example.com",
            amount=Decimal("10.00"),
            reference=None,
        )

    recovery.create.assert_not_awaited()
    session.commit.assert_not_awaited()


@pytest.mark.anyio
async def test_reserve_rejects_transfer_to_own_account(recovery_dependencies) -> None:
    service, session, accounts, _users, _transactions, recovery = recovery_dependencies
    own_account = SimpleNamespace(id=10)
    accounts.get_by_user_id.return_value = own_account
    accounts.get_by_iban.return_value = own_account
    recovery.get_by_key.return_value = None

    with pytest.raises(TransactionProcessingError, match="must differ"):
        await service.reserve(
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        )

    recovery.create.assert_not_awaited()
    session.commit.assert_not_awaited()


@pytest.mark.anyio
async def test_reserve_resolves_matching_concurrent_insert_as_replay(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, _transactions, recovery = recovery_dependencies
    source = SimpleNamespace(id=10)
    destination = SimpleNamespace(id=20)
    fingerprint = TransactionProcessing.calculate_request_fingerprint(
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("10.00"),
        reference=None,
    )
    existing = make_operation(fingerprint=fingerprint)
    accounts.get_by_user_id.return_value = source
    accounts.get_by_iban.return_value = destination
    recovery.get_by_key.side_effect = [None, existing]
    recovery.create.side_effect = make_integrity_error(
        RecoverTransaction.IDEMPOTENCY_CONSTRAINT
    )

    operation, created = await service.reserve(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("10.00"),
        reference=None,
    )

    assert operation is existing
    assert created is False
    session.rollback.assert_awaited_once()
    session.commit.assert_not_awaited()


@pytest.mark.anyio
async def test_reserve_rejects_concurrent_different_request_for_same_key(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, _transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = SimpleNamespace(id=10)
    accounts.get_by_iban.return_value = SimpleNamespace(id=20)
    recovery.get_by_key.side_effect = [None, make_operation(fingerprint="f" * 64)]
    recovery.create.side_effect = make_integrity_error(
        RecoverTransaction.IDEMPOTENCY_CONSTRAINT
    )

    with pytest.raises(RecoveryConflictError, match="different request"):
        await service.reserve(
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        )

    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_reserve_reports_another_pending_transfer_for_partial_unique_conflict(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, _transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = SimpleNamespace(id=10)
    accounts.get_by_iban.return_value = SimpleNamespace(id=20)
    recovery.get_by_key.return_value = None
    recovery.create.side_effect = make_integrity_error(
        RecoverTransaction.PENDING_TRANSFER_CONSTRAINT
    )

    with pytest.raises(RecoveryConflictError, match="already awaiting confirmation"):
        await service.reserve(
            user_id=7,
            idempotency_key="another-key-002",
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        )

    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_reserve_does_not_hide_unrelated_integrity_errors(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, _transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = SimpleNamespace(id=10)
    accounts.get_by_iban.return_value = SimpleNamespace(id=20)
    recovery.get_by_key.return_value = None
    error = make_integrity_error("some_other_constraint")
    recovery.create.side_effect = error

    with pytest.raises(IntegrityError) as exc_info:
        await service.reserve(
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        )

    assert exc_info.value is error
    session.rollback.assert_awaited_once()


@pytest.mark.anyio
async def test_resume_completes_transfer_and_commits_all_state_together(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, transactions, recovery = recovery_dependencies
    operation = make_operation()
    source = SimpleNamespace(id=10, balance=Decimal("100.00"))
    destination = SimpleNamespace(id=20, balance=Decimal("5.00"))
    transaction = make_transaction()
    recovery.get_owned_operation.return_value = (operation, destination)
    accounts.lock_for_transfer.return_value = [destination, source]
    transactions.create.return_value = transaction

    result_status, result_operation, result_transaction = await service.resume(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
    )

    assert result_status == "COMPLETED"
    assert result_operation is operation
    assert result_transaction is transaction
    assert source.balance == Decimal("90.00")
    assert destination.balance == Decimal("15.00")
    assert operation.status == "COMPLETED"
    assert operation.transaction_id == transaction.id
    assert operation.failure_code is None
    transactions.create.assert_awaited_once_with(
        source_account_id=10,
        destination_account_id=20,
        amount=Decimal("10.00"),
        transaction_type="TRANSFER",
        status="COMPLETED",
        reference=None,
        transfer_method="iban",
        idempotency_key=IDEMPOTENCY_KEY,
        request_fingerprint=operation.request_fingerprint,
    )
    session.commit.assert_awaited_once()


@pytest.mark.anyio
async def test_resume_returns_completed_result_without_moving_balances_again(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, transactions, recovery = recovery_dependencies
    operation = make_operation(status="COMPLETED", transaction_id=99)
    destination = SimpleNamespace(id=20)
    transaction = make_transaction()
    recovery.get_owned_operation.return_value = (operation, destination)
    transactions.get_by_id.return_value = transaction

    result = await service.resume(user_id=7, idempotency_key=IDEMPOTENCY_KEY)

    assert result == ("COMPLETED", operation, transaction)
    accounts.lock_for_transfer.assert_not_awaited()
    transactions.create.assert_not_awaited()
    session.commit.assert_not_awaited()


@pytest.mark.anyio
async def test_resume_returns_failed_result_without_retrying_transfer(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, transactions, recovery = recovery_dependencies
    operation = make_operation(status="FAILED")
    recovery.get_owned_operation.return_value = (
        operation,
        SimpleNamespace(id=20),
    )

    result = await service.resume(user_id=7, idempotency_key=IDEMPOTENCY_KEY)

    assert result == ("FAILED", operation, None)
    accounts.lock_for_transfer.assert_not_awaited()
    transactions.create.assert_not_awaited()
    session.commit.assert_not_awaited()


@pytest.mark.anyio
async def test_resume_raises_when_operation_is_not_owned_or_missing(
    recovery_dependencies,
) -> None:
    service, _session, accounts, _users, _transactions, recovery = recovery_dependencies
    recovery.get_owned_operation.return_value = None

    with pytest.raises(RecoveryNotFoundError):
        await service.resume(user_id=7, idempotency_key=IDEMPOTENCY_KEY)

    accounts.lock_for_transfer.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("source_balance", "destination_balance", "locked_accounts", "failure_code"),
    [
        (Decimal("5.00"), Decimal("5.00"), "both", "INSUFFICIENT_FUNDS"),
        (
            Decimal("100.00"),
            Decimal("999999999999999.00"),
            "both",
            "BALANCE_LIMIT_EXCEEDED",
        ),
        (Decimal("100.00"), Decimal("5.00"), "source_only", "ACCOUNT_NOT_FOUND"),
    ],
)
async def test_resume_persists_failure_without_mutating_balances(
    recovery_dependencies,
    source_balance: Decimal,
    destination_balance: Decimal,
    locked_accounts: str,
    failure_code: str,
) -> None:
    service, session, accounts, _users, transactions, recovery = recovery_dependencies
    operation = make_operation()
    source = SimpleNamespace(id=10, balance=source_balance)
    destination = SimpleNamespace(id=20, balance=destination_balance)
    recovery.get_owned_operation.return_value = (operation, destination)
    accounts.lock_for_transfer.return_value = (
        [source, destination] if locked_accounts == "both" else [source]
    )

    result_status, result_operation, result_transaction = await service.resume(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
    )

    assert result_status == "FAILED"
    assert result_operation is operation
    assert result_transaction is None
    assert operation.status == "FAILED"
    assert operation.failure_code == failure_code
    assert source.balance == source_balance
    assert destination.balance == destination_balance
    transactions.create.assert_not_awaited()
    session.commit.assert_awaited_once()


@pytest.mark.anyio
async def test_get_pending_delegates_to_recovery_repository(
    recovery_dependencies,
) -> None:
    service, _session, _accounts, _users, _transactions, recovery = (
        recovery_dependencies
    )
    pending = (make_operation(), SimpleNamespace(id=20))
    recovery.get_pending_for_user.return_value = pending

    assert await service.get_pending(7) == pending
    recovery.get_pending_for_user.assert_awaited_once_with(7)


@pytest.mark.anyio
async def test_get_status_returns_recovery_status_and_linked_transaction(
    recovery_dependencies,
) -> None:
    service, _session, _accounts, _users, transactions, recovery = recovery_dependencies
    operation = make_operation(status="COMPLETED", transaction_id=99)
    destination = SimpleNamespace(id=20)
    transaction = make_transaction()
    recovery.get_owned_operation.return_value = (operation, destination)
    transactions.get_by_id.return_value = transaction

    assert await service.get_status(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
    ) == ("COMPLETED", operation, transaction)


@pytest.mark.anyio
async def test_get_status_falls_back_to_legacy_transaction_record(
    recovery_dependencies,
) -> None:
    service, _session, accounts, _users, transactions, recovery = recovery_dependencies
    source = SimpleNamespace(id=10)
    transaction = make_transaction()
    recovery.get_owned_operation.return_value = None
    accounts.get_by_user_id.return_value = source
    transactions.get_by_idempotency_key.return_value = transaction

    assert await service.get_status(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
    ) == ("COMPLETED", None, transaction)


@pytest.mark.anyio
async def test_get_status_returns_not_found_without_source_account(
    recovery_dependencies,
) -> None:
    service, _session, accounts, _users, transactions, recovery = recovery_dependencies
    recovery.get_owned_operation.return_value = None
    accounts.get_by_user_id.return_value = None

    assert await service.get_status(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
    ) == ("NOT_FOUND", None, None)
    transactions.get_by_idempotency_key.assert_not_awaited()


@pytest.mark.anyio
async def test_reserve_does_not_treat_unrelated_integrity_error_as_replay(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, _transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = SimpleNamespace(id=10)
    accounts.get_by_iban.return_value = SimpleNamespace(id=20)
    matching_existing = make_operation()
    recovery.get_by_key.side_effect = [None, matching_existing]
    error = make_integrity_error("some_other_constraint")
    recovery.create.side_effect = error

    with pytest.raises(IntegrityError) as exc_info:
        await service.reserve(
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        )

    assert exc_info.value is error
    session.rollback.assert_awaited_once()
    # The service must not query for and replay a matching key after an
    # unrelated database constraint failed.
    recovery.get_by_key.assert_awaited_once_with(10, IDEMPOTENCY_KEY)


@pytest.mark.anyio
async def test_get_integrity_constraint_name_prefers_driver_attribute() -> None:
    error = IntegrityError(
        "INSERT INTO transaction_recovery",
        {},
        FakeDatabaseErrorWithConstraint("uq_transaction_recovery_source_key"),
    )

    assert (
        RecoverTransaction._get_integrity_constraint_name(error)
        == "uq_transaction_recovery_source_key"
    )


@pytest.mark.anyio
async def test_reserve_rejects_invalid_iban_before_repository_lookup(
    recovery_dependencies,
) -> None:
    service, _session, accounts, _users, _transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = SimpleNamespace(id=10)
    recovery.get_by_key.return_value = None

    with pytest.raises(TransactionProcessingError, match="Invalid destination IBAN"):
        await service.reserve(
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
            destination_iban="DE00000000000000000000",
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        )

    accounts.get_by_iban.assert_not_awaited()
    recovery.create.assert_not_awaited()


@pytest.mark.anyio
async def test_reserve_rejects_missing_destination_account(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, _transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = SimpleNamespace(id=10)
    accounts.get_by_iban.return_value = None
    recovery.get_by_key.return_value = None

    with pytest.raises(
        TransactionProcessingError,
        match="Destination financial account not found",
    ):
        await service.reserve(
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        )

    recovery.create.assert_not_awaited()
    session.commit.assert_not_awaited()


@pytest.mark.anyio
async def test_reserve_preserves_idempotency_integrity_error_when_row_is_missing(
    recovery_dependencies,
) -> None:
    service, session, accounts, _users, _transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = SimpleNamespace(id=10)
    accounts.get_by_iban.return_value = SimpleNamespace(id=20)
    recovery.get_by_key.side_effect = [None, None]
    error = make_integrity_error(RecoverTransaction.IDEMPOTENCY_CONSTRAINT)
    recovery.create.side_effect = error

    with pytest.raises(IntegrityError) as exc_info:
        await service.reserve(
            user_id=7,
            idempotency_key=IDEMPOTENCY_KEY,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("10.00"),
            reference=None,
        )

    assert exc_info.value is error
    session.rollback.assert_awaited_once()
    assert recovery.get_by_key.await_count == 2
    assert recovery.get_by_key.await_args_list == [
        ((10, IDEMPOTENCY_KEY), {}),
        ((10, IDEMPOTENCY_KEY), {}),
    ]


@pytest.mark.anyio
async def test_get_status_returns_not_found_when_legacy_transaction_is_missing(
    recovery_dependencies,
) -> None:
    service, _session, accounts, _users, transactions, recovery = recovery_dependencies
    accounts.get_by_user_id.return_value = SimpleNamespace(id=10)
    recovery.get_owned_operation.return_value = None
    transactions.get_by_idempotency_key.return_value = None

    assert await service.get_status(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
    ) == ("NOT_FOUND", None, None)

    transactions.get_by_idempotency_key.assert_awaited_once_with(
        10,
        IDEMPOTENCY_KEY,
    )


@pytest.mark.anyio
async def test_get_status_loads_transaction_linked_to_recovery_operation(
    recovery_dependencies,
) -> None:
    service, _session, _accounts, _users, transactions, recovery = recovery_dependencies
    operation = make_operation(status="COMPLETED", transaction_id=99)
    linked_transaction = make_transaction()
    recovery.get_owned_operation.return_value = (operation, SimpleNamespace(id=20))
    transactions.get_by_id.return_value = linked_transaction

    assert await service.get_status(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
    ) == ("COMPLETED", operation, linked_transaction)

    transactions.get_by_id.assert_awaited_once_with(99)


@pytest.mark.anyio
async def test_get_status_returns_operation_without_linked_transaction(
    recovery_dependencies,
) -> None:
    service, _session, _accounts, _users, transactions, recovery = recovery_dependencies
    operation = make_operation(status="PROCESSING", transaction_id=None)
    recovery.get_owned_operation.return_value = (operation, SimpleNamespace(id=20))

    assert await service.get_status(
        user_id=7,
        idempotency_key=IDEMPOTENCY_KEY,
    ) == ("PROCESSING", operation, None)

    transactions.get_by_id.assert_not_awaited()


@pytest.mark.anyio
async def test_recovery_repository_get_by_key_with_and_without_row_lock() -> None:
    from app.infrastructure.repositories.transaction_recovery import (
        TransactionRecoveryRepository,
    )

    session = AsyncMock(spec=AsyncSession)
    result = SimpleNamespace(scalar_one_or_none=lambda: make_operation())
    session.execute.return_value = result
    repository = TransactionRecoveryRepository(session)

    operation = await repository.get_by_key(10, IDEMPOTENCY_KEY)
    locked_operation = await repository.get_by_key(
        10,
        IDEMPOTENCY_KEY,
        for_update=True,
    )

    assert operation is not None
    assert locked_operation is not None
    assert session.execute.await_count == 2


@pytest.mark.anyio
@pytest.mark.parametrize("has_row", [False, True])
async def test_recovery_repository_get_pending_for_user(has_row: bool) -> None:
    from app.infrastructure.repositories.transaction_recovery import (
        TransactionRecoveryRepository,
    )

    session = AsyncMock(spec=AsyncSession)
    operation = make_operation()
    destination = SimpleNamespace(id=20)
    result = SimpleNamespace(
        first=lambda: (operation, destination) if has_row else None
    )
    session.execute.return_value = result
    repository = TransactionRecoveryRepository(session)

    pending = await repository.get_pending_for_user(7)

    if has_row:
        assert pending == (operation, destination)
    else:
        assert pending is None


@pytest.mark.anyio
@pytest.mark.parametrize("for_update", [False, True])
async def test_recovery_repository_get_owned_operation(
    for_update: bool,
) -> None:
    from app.infrastructure.repositories.transaction_recovery import (
        TransactionRecoveryRepository,
    )

    session = AsyncMock(spec=AsyncSession)
    operation = make_operation()
    destination = SimpleNamespace(id=20)
    result = SimpleNamespace(first=lambda: (operation, destination))
    session.execute.return_value = result
    repository = TransactionRecoveryRepository(session)

    owned = await repository.get_owned_operation(
        7,
        IDEMPOTENCY_KEY,
        for_update=for_update,
    )

    assert owned == (operation, destination)


@pytest.mark.anyio
async def test_recovery_repository_create_adds_and_flushes_operation() -> None:
    from app.infrastructure.repositories.transaction_recovery import (
        TransactionRecoveryRepository,
    )

    session = AsyncMock(spec=AsyncSession)
    repository = TransactionRecoveryRepository(session)
    operation = make_operation()

    # This test uses a lightweight test double; cast it to the repository
    # contract so static type checkers accept the create() call.
    await repository.create(cast(TransactionRecovery, operation))

    session.add.assert_called_once_with(operation)
    session.flush.assert_awaited_once()
