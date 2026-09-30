from decimal import Decimal

from app.application.accounts.ports import AccountRepositoryPort
from app.application.transactions.ports import TransactionRepositoryPort
from app.domain.account.iban import is_valid_iban
from app.infrastructure.database.models.transaction import Transaction


class TransactionProcessingError(Exception):
    """Raise when transaction processing fails."""


class TransactionProcessing:
    """Process an internal transfer between financial accounts."""

    def __init__(
        self,
        account_repository: AccountRepositoryPort,
        transaction_repository: TransactionRepositoryPort,
    ) -> None:
        self.account_repository = account_repository
        self.transaction_repository = transaction_repository

    async def execute(
        self,
        user_id: int,
        destination_iban: str,
        amount: Decimal,
    ) -> Transaction:
        """Process an internal transfer for an authenticated user."""
        if not amount.is_finite() or amount <= 0:
            raise TransactionProcessingError(
                "Transaction amount must be greater than zero.",
            )

        exponent = amount.as_tuple().exponent

        if isinstance(exponent, int) and exponent < -4:
            raise TransactionProcessingError(
                "Transaction amount supports at most four decimal places.",
            )

        normalized_destination_iban = "".join(destination_iban.split()).upper()

        if not is_valid_iban(normalized_destination_iban):
            raise TransactionProcessingError(
                "Invalid destination IBAN.",
            )

        source_account = await self.account_repository.get_by_user_id(
            user_id=user_id,
        )

        if source_account is None:
            raise TransactionProcessingError(
                "Source financial account not found.",
            )

        destination_account = await self.account_repository.get_by_iban(
            iban=normalized_destination_iban,
        )

        if destination_account is None:
            raise TransactionProcessingError(
                "Destination financial account not found.",
            )

        if source_account.id == destination_account.id:
            raise TransactionProcessingError(
                "Source and destination accounts must differ.",
            )

        locked_accounts = await self.account_repository.lock_for_transfer(
            account_ids=sorted(
                [source_account.id, destination_account.id],
            ),
        )

        locked_accounts_by_id = {account.id: account for account in locked_accounts}

        source_account = locked_accounts_by_id[source_account.id]
        destination_account = locked_accounts_by_id[destination_account.id]

        if source_account.balance < amount:
            raise TransactionProcessingError("Insufficient funds.")

        source_account.balance -= amount
        destination_account.balance += amount

        return await self.transaction_repository.create(
            source_account_id=source_account.id,
            destination_account_id=destination_account.id,
            amount=amount,
            transaction_type="TRANSFER",
            status="COMPLETED",
        )
