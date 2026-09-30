from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.application.transactions.process_transaction import (
    TransactionProcessing,
    TransactionProcessingError,
)

VALID_IBAN = "DE89370400440532013000"


def create_account(
    account_id: int,
    balance: str,
) -> SimpleNamespace:
    """Create a simple account test double."""
    return SimpleNamespace(
        id=account_id,
        balance=Decimal(balance),
    )


@pytest.fixture
def account_repository() -> AsyncMock:
    """Provide a mocked account repository."""
    return AsyncMock()


@pytest.fixture
def transaction_repository() -> AsyncMock:
    """Provide a mocked transaction repository."""
    return AsyncMock()


@pytest.fixture
def transaction_processing(
    account_repository: AsyncMock,
    transaction_repository: AsyncMock,
) -> TransactionProcessing:
    """Provide a transaction processing use case."""
    return TransactionProcessing(
        account_repository=account_repository,
        transaction_repository=transaction_repository,
    )


@pytest.mark.anyio
async def test_process_transaction_successfully_transfers_funds(
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
    transaction_repository: AsyncMock,
) -> None:
    source_account = create_account(1, "1000.00")
    destination_account = create_account(2, "250.00")
    transaction = object()

    account_repository.get_by_user_id.return_value = source_account
    account_repository.get_by_iban.return_value = destination_account
    account_repository.lock_for_transfer.return_value = [
        destination_account,
        source_account,
    ]
    transaction_repository.create.return_value = transaction

    result = await transaction_processing.execute(
        user_id=10,
        destination_iban=VALID_IBAN,
        amount=Decimal("125.50"),
    )

    assert result is transaction
    assert source_account.balance == Decimal("874.50")
    assert destination_account.balance == Decimal("375.50")

    account_repository.get_by_user_id.assert_awaited_once_with(
        user_id=10,
    )
    account_repository.get_by_iban.assert_awaited_once_with(
        iban=VALID_IBAN,
    )
    account_repository.lock_for_transfer.assert_awaited_once_with(
        account_ids=[1, 2],
    )
    transaction_repository.create.assert_awaited_once_with(
        source_account_id=1,
        destination_account_id=2,
        amount=Decimal("125.50"),
        transaction_type="TRANSFER",
        status="COMPLETED",
    )


@pytest.mark.anyio
async def test_process_transaction_normalizes_destination_iban(
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
    transaction_repository: AsyncMock,
) -> None:
    source_account = create_account(1, "1000.00")
    destination_account = create_account(2, "250.00")

    account_repository.get_by_user_id.return_value = source_account
    account_repository.get_by_iban.return_value = destination_account
    account_repository.lock_for_transfer.return_value = [
        source_account,
        destination_account,
    ]

    await transaction_processing.execute(
        user_id=10,
        destination_iban="de89 3704 0044 0532 0130 00",
        amount=Decimal("100.00"),
    )

    account_repository.get_by_iban.assert_awaited_once_with(
        iban=VALID_IBAN,
    )
    transaction_repository.create.assert_awaited_once()


@pytest.mark.anyio
async def test_process_transaction_rejects_zero_amount(
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
) -> None:
    with pytest.raises(
        TransactionProcessingError,
        match="Transaction amount must be greater than zero.",
    ):
        await transaction_processing.execute(
            user_id=10,
            destination_iban=VALID_IBAN,
            amount=Decimal("0"),
        )

    account_repository.get_by_user_id.assert_not_awaited()


@pytest.mark.anyio
async def test_process_transaction_rejects_negative_amount(
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
) -> None:
    with pytest.raises(
        TransactionProcessingError,
        match="Transaction amount must be greater than zero.",
    ):
        await transaction_processing.execute(
            user_id=10,
            destination_iban=VALID_IBAN,
            amount=Decimal("-10.00"),
        )

    account_repository.get_by_user_id.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize(
    "amount",
    [
        Decimal("NaN"),
        Decimal("Infinity"),
        Decimal("-Infinity"),
    ],
)
async def test_process_transaction_rejects_non_finite_amount(
    amount: Decimal,
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
) -> None:
    with pytest.raises(
        TransactionProcessingError,
        match="Transaction amount must be greater than zero.",
    ):
        await transaction_processing.execute(
            user_id=10,
            destination_iban=VALID_IBAN,
            amount=amount,
        )

    account_repository.get_by_user_id.assert_not_awaited()


@pytest.mark.anyio
async def test_process_transaction_rejects_more_than_four_decimal_places(
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
) -> None:
    with pytest.raises(
        TransactionProcessingError,
        match="Transaction amount supports at most four decimal places.",
    ):
        await transaction_processing.execute(
            user_id=10,
            destination_iban=VALID_IBAN,
            amount=Decimal("100.00001"),
        )

    account_repository.get_by_user_id.assert_not_awaited()


@pytest.mark.anyio
async def test_process_transaction_rejects_invalid_destination_iban(
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
) -> None:
    with pytest.raises(
        TransactionProcessingError,
        match="Invalid destination IBAN.",
    ):
        await transaction_processing.execute(
            user_id=10,
            destination_iban="DE00000000000000000000",
            amount=Decimal("100.00"),
        )

    account_repository.get_by_user_id.assert_not_awaited()


@pytest.mark.anyio
async def test_process_transaction_rejects_missing_source_account(
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
) -> None:
    account_repository.get_by_user_id.return_value = None

    with pytest.raises(
        TransactionProcessingError,
        match="Source financial account not found.",
    ):
        await transaction_processing.execute(
            user_id=10,
            destination_iban=VALID_IBAN,
            amount=Decimal("100.00"),
        )

    account_repository.get_by_iban.assert_not_awaited()


@pytest.mark.anyio
async def test_process_transaction_rejects_missing_destination_account(
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
) -> None:
    source_account = create_account(1, "1000.00")

    account_repository.get_by_user_id.return_value = source_account
    account_repository.get_by_iban.return_value = None

    with pytest.raises(
        TransactionProcessingError,
        match="Destination financial account not found.",
    ):
        await transaction_processing.execute(
            user_id=10,
            destination_iban=VALID_IBAN,
            amount=Decimal("100.00"),
        )

    account_repository.lock_for_transfer.assert_not_awaited()


@pytest.mark.anyio
async def test_process_transaction_rejects_same_source_and_destination(
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
) -> None:
    account = create_account(1, "1000.00")

    account_repository.get_by_user_id.return_value = account
    account_repository.get_by_iban.return_value = account

    with pytest.raises(
        TransactionProcessingError,
        match="Source and destination accounts must differ.",
    ):
        await transaction_processing.execute(
            user_id=10,
            destination_iban=VALID_IBAN,
            amount=Decimal("100.00"),
        )

    account_repository.lock_for_transfer.assert_not_awaited()


@pytest.mark.anyio
async def test_process_transaction_rejects_insufficient_funds(
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
    transaction_repository: AsyncMock,
) -> None:
    source_account = create_account(1, "50.00")
    destination_account = create_account(2, "250.00")

    account_repository.get_by_user_id.return_value = source_account
    account_repository.get_by_iban.return_value = destination_account
    account_repository.lock_for_transfer.return_value = [
        source_account,
        destination_account,
    ]

    with pytest.raises(
        TransactionProcessingError,
        match="Insufficient funds.",
    ):
        await transaction_processing.execute(
            user_id=10,
            destination_iban=VALID_IBAN,
            amount=Decimal("50.01"),
        )

    assert source_account.balance == Decimal("50.00")
    assert destination_account.balance == Decimal("250.00")
    transaction_repository.create.assert_not_awaited()


@pytest.mark.anyio
async def test_process_transaction_locks_accounts_in_sorted_order(
    transaction_processing: TransactionProcessing,
    account_repository: AsyncMock,
) -> None:
    source_account = create_account(10, "1000.00")
    destination_account = create_account(3, "250.00")

    account_repository.get_by_user_id.return_value = source_account
    account_repository.get_by_iban.return_value = destination_account
    account_repository.lock_for_transfer.return_value = [
        destination_account,
        source_account,
    ]

    await transaction_processing.execute(
        user_id=10,
        destination_iban=VALID_IBAN,
        amount=Decimal("100.00"),
    )

    account_repository.lock_for_transfer.assert_awaited_once_with(
        account_ids=[3, 10],
    )
