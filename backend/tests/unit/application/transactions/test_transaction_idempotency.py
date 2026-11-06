from decimal import Decimal, localcontext
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

import pytest

from app.application.transactions.process_transaction import (
    IdempotencyConflictError,
    InvalidIdempotencyKeyError,
    TransactionProcessing,
    TransactionProcessingError,
)

VALID_IBAN = "DE89370400440532013000"


def make_transaction(fingerprint: str) -> SimpleNamespace:
    """Build a minimal persisted transaction representation."""
    return SimpleNamespace(
        id=123,
        request_fingerprint=fingerprint,
    )


@pytest.fixture
def repositories():
    """Provide isolated asynchronous repository mocks."""
    accounts = AsyncMock()
    transactions = AsyncMock()
    users = AsyncMock()
    transactions.get_by_idempotency_key.return_value = None

    return accounts, transactions, users


def make_processor(repositories) -> TransactionProcessing:
    """Build a transaction processor with mocked repositories."""
    accounts, transactions, users = repositories

    return TransactionProcessing(accounts, transactions, users)


@pytest.mark.anyio
async def test_matching_key_and_payload_replays_existing_transaction(
    repositories,
):
    """Return the existing transaction without repeating balance changes."""
    accounts, transactions, _ = repositories

    source = SimpleNamespace(
        id=1,
        balance=Decimal("1000.00"),
    )
    destination = SimpleNamespace(
        id=2,
        balance=Decimal("100.00"),
    )

    accounts.get_by_user_id.return_value = source

    processor = make_processor(repositories)

    fingerprint = processor.calculate_request_fingerprint(
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("100.00"),
        reference=None,
    )

    existing = make_transaction(fingerprint)
    transactions.get_by_idempotency_key.return_value = existing

    result = await processor.execute(
        user_id=7,
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("100.00"),
        idempotency_key="retry-transaction-1",
    )

    assert result is existing
    assert processor.last_request_replayed is True

    assert source.balance == Decimal("1000.00")
    assert destination.balance == Decimal("100.00")

    accounts.get_by_iban.assert_not_awaited()
    accounts.lock_for_transfer.assert_not_awaited()
    transactions.create.assert_not_awaited()


@pytest.mark.anyio
async def test_reusing_key_with_different_payload_is_rejected(repositories):
    """Reject a reused key when the requested transaction differs."""
    accounts, transactions, _ = repositories

    source = SimpleNamespace(
        id=1,
        balance=Decimal("1000.00"),
    )
    accounts.get_by_user_id.return_value = source

    processor = make_processor(repositories)

    existing_fingerprint = processor.calculate_request_fingerprint(
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("50.00"),
        reference=None,
    )

    transactions.get_by_idempotency_key.return_value = make_transaction(
        existing_fingerprint,
    )

    with pytest.raises(IdempotencyConflictError):
        await processor.execute(
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("100.00"),
            idempotency_key="retry-transaction-2",
        )

    accounts.get_by_iban.assert_not_awaited()
    accounts.lock_for_transfer.assert_not_awaited()
    transactions.create.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize(
    "key",
    [
        "",
        "with spaces",
        "bad/key",
        "x" * 129,
    ],
)
async def test_invalid_idempotency_key_is_rejected(
    repositories,
    key,
):
    """Reject an invalid key before accessing account repositories."""
    processor = make_processor(repositories)

    with pytest.raises(InvalidIdempotencyKeyError):
        await processor.execute(
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("100.00"),
            idempotency_key=key,
        )

    repositories[0].get_by_user_id.assert_not_awaited()
    repositories[1].get_by_idempotency_key.assert_not_awaited()
    repositories[1].create.assert_not_awaited()


@pytest.mark.anyio
async def test_rejects_non_decimal_amount_before_repository_access(
    repositories,
):
    """Reject a runtime amount of the wrong type."""
    processor = make_processor(repositories)

    with pytest.raises(
        TransactionProcessingError,
        match="Transaction amount must be a decimal value.",
    ):
        await processor.execute(
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=cast(Decimal, 100),
            idempotency_key="valid-key-001",
        )

    repositories[0].get_by_user_id.assert_not_awaited()


@pytest.mark.anyio
async def test_rejects_amount_at_numeric_column_upper_bound(repositories):
    """Reject an amount at the unsupported upper bound."""
    processor = make_processor(repositories)

    with pytest.raises(
        TransactionProcessingError,
        match="Transaction amount exceeds the supported maximum.",
    ):
        await processor.execute(
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("1000000000000000"),
            idempotency_key="valid-key-002",
        )

    repositories[0].get_by_user_id.assert_not_awaited()


@pytest.mark.anyio
async def test_rejects_non_string_reference_before_repository_access(
    repositories,
):
    """Reject a reference of the wrong runtime type."""
    processor = make_processor(repositories)

    with pytest.raises(
        TransactionProcessingError,
        match="Transaction reference must be a string.",
    ):
        await processor.execute(
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("100.00"),
            idempotency_key="valid-key-003",
            reference=123,  # type: ignore[arg-type]
        )

    repositories[0].get_by_user_id.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize(
    (
        "destination_iban",
        "destination_email",
        "expected_message",
    ),
    [
        (
            "   ",
            None,
            "Invalid destination IBAN.",
        ),
        (
            None,
            " \t ",
            "Destination email must not be empty.",
        ),
    ],
)
async def test_rejects_empty_normalized_destination_before_repository_access(
    repositories,
    destination_iban,
    destination_email,
    expected_message,
):
    """Reject destinations that become empty after normalization."""
    processor = make_processor(repositories)

    with pytest.raises(
        TransactionProcessingError,
        match=expected_message,
    ):
        await processor.execute(
            user_id=7,
            destination_iban=destination_iban,
            destination_email=destination_email,
            amount=Decimal("100.00"),
            idempotency_key="valid-key-004",
        )

    repositories[0].get_by_user_id.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize(
    "locked_accounts",
    [
        [SimpleNamespace(id=2, balance=Decimal("100.00"))],
        [SimpleNamespace(id=1, balance=Decimal("100.00"))],
        [],
    ],
)
async def test_rejects_transfer_when_both_locked_accounts_are_not_returned(
    repositories,
    locked_accounts,
):
    """Do not mutate balances if either account could not be locked."""
    accounts, transactions, _ = repositories

    source = SimpleNamespace(
        id=1,
        balance=Decimal("1000.00"),
    )
    destination = SimpleNamespace(
        id=2,
        balance=Decimal("100.00"),
    )

    accounts.get_by_user_id.return_value = source
    accounts.get_by_iban.return_value = destination
    accounts.lock_for_transfer.return_value = locked_accounts

    processor = make_processor(repositories)

    with pytest.raises(
        TransactionProcessingError,
        match="A source or destination account could not be locked.",
    ):
        await processor.execute(
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("100.00"),
            idempotency_key="lock-check-001",
        )

    assert source.balance == Decimal("1000.00")
    assert destination.balance == Decimal("100.00")

    transactions.create.assert_not_awaited()


@pytest.mark.anyio
async def test_rechecks_idempotency_after_account_locks_before_changing_balances(
    repositories,
):
    """Replay if another request wins while this request acquires locks."""
    accounts, transactions, _ = repositories

    source = SimpleNamespace(
        id=1,
        balance=Decimal("1000.00"),
    )
    destination = SimpleNamespace(
        id=2,
        balance=Decimal("100.00"),
    )

    accounts.get_by_user_id.return_value = source
    accounts.get_by_iban.return_value = destination
    accounts.lock_for_transfer.return_value = [
        source,
        destination,
    ]

    processor = make_processor(repositories)

    fingerprint = processor.calculate_request_fingerprint(
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("100.00"),
        reference=None,
    )

    existing = make_transaction(fingerprint)

    transactions.get_by_idempotency_key.side_effect = [
        None,
        existing,
    ]

    result = await processor.execute(
        user_id=7,
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("100.00"),
        idempotency_key="concurrent-replay-001",
    )

    assert result is existing
    assert processor.last_request_replayed is True

    assert transactions.get_by_idempotency_key.await_count == 2

    assert source.balance == Decimal("1000.00")
    assert destination.balance == Decimal("100.00")

    transactions.create.assert_not_awaited()


@pytest.mark.anyio
async def test_rejects_transfer_that_would_exceed_destination_balance_limit(
    repositories,
):
    """Keep both balances unchanged when the resulting balance is invalid."""
    accounts, transactions, _ = repositories

    source = SimpleNamespace(
        id=1,
        balance=Decimal("100.00"),
    )
    destination = SimpleNamespace(
        id=2,
        balance=Decimal("999999999999999.00"),
    )

    accounts.get_by_user_id.return_value = source
    accounts.get_by_iban.return_value = destination
    accounts.lock_for_transfer.return_value = [
        source,
        destination,
    ]

    processor = make_processor(repositories)

    with pytest.raises(
        TransactionProcessingError,
        match="Destination account balance would exceed the supported maximum.",
    ):
        await processor.execute(
            user_id=7,
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=Decimal("1.00"),
            idempotency_key="balance-limit-001",
        )

    assert source.balance == Decimal("100.00")
    assert destination.balance == Decimal("999999999999999.00")

    transactions.create.assert_not_awaited()


def test_request_fingerprint_normalizes_email_case_and_blank_reference() -> None:
    """Equivalent email/reference representations must replay as one intent."""
    first = TransactionProcessing.calculate_request_fingerprint(
        destination_iban=None,
        destination_email=" Recipient@Example.com ",
        amount=Decimal("12.5000"),
        reference="   ",
    )
    second = TransactionProcessing.calculate_request_fingerprint(
        destination_iban=None,
        destination_email="recipient@example.com",
        amount=Decimal("12.5"),
        reference=None,
    )

    assert first == second


def test_fingerprint_is_independent_of_decimal_context_precision():
    """Fingerprinting must not round amounts under a custom Decimal context."""
    from app.domain.idempotency.fingerprint import transaction_fingerprint

    kwargs = {
        "destination_iban": VALID_IBAN,
        "destination_email": None,
        "amount": Decimal("123456789012345.1234"),
        "reference": "invoice-42",
    }

    expected = transaction_fingerprint(**kwargs)

    with localcontext() as context:
        context.prec = 6
        actual = transaction_fingerprint(**kwargs)

    assert actual == expected


@pytest.mark.parametrize(
    ("first", "second"),
    [
        (Decimal("12.5000"), Decimal("12.5")),
        (Decimal("100.0000"), Decimal("100")),
        (Decimal("0.0100"), Decimal("0.01")),
    ],
)
def test_fingerprint_canonicalizes_equivalent_decimal_scales(first, second):
    """Equivalent decimal values have identical fingerprints."""
    from app.domain.idempotency.fingerprint import transaction_fingerprint

    common = {
        "destination_iban": VALID_IBAN,
        "destination_email": None,
        "reference": None,
    }

    assert transaction_fingerprint(amount=first, **common) == (
        transaction_fingerprint(amount=second, **common)
    )


def test_fingerprint_canonicalizes_signed_decimal_zero() -> None:
    from app.domain.idempotency.fingerprint import transaction_fingerprint

    assert transaction_fingerprint(
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("-0.000"),
        reference=None,
    ) == transaction_fingerprint(
        destination_iban=VALID_IBAN,
        destination_email=None,
        amount=Decimal("0"),
        reference=None,
    )


@pytest.mark.parametrize("amount", [Decimal("NaN"), Decimal("Infinity")])
def test_fingerprint_rejects_non_finite_decimal_amount(amount: Decimal) -> None:
    from app.domain.idempotency.fingerprint import transaction_fingerprint

    with pytest.raises(ValueError, match="finite Decimal"):
        transaction_fingerprint(
            destination_iban=VALID_IBAN,
            destination_email=None,
            amount=amount,
            reference=None,
        )
