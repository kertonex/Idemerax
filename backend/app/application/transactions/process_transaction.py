from decimal import Decimal

from app.application.accounts.ports import AccountRepositoryPort
from app.application.transactions.ports import (
    TransactionRepositoryPort,
    UserRepositoryPort,
)
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
        user_repository: UserRepositoryPort,
    ) -> None:
        self.account_repository = account_repository
        self.transaction_repository = transaction_repository
        self.user_repository = user_repository

    async def execute(
        self,
        user_id: int,
        destination_iban: str | None,
        destination_email: str | None,
        amount: Decimal,
        reference: str | None = None,
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

        if (destination_iban is None) == (destination_email is None):
            raise TransactionProcessingError(
                "Exactly one destination must be provided.",
            )

        normalized_reference = reference.strip() if reference else None
        normalized_reference = normalized_reference or None

        if normalized_reference is not None and len(normalized_reference) > 140:
            raise TransactionProcessingError(
                "Transaction reference must not exceed 140 characters.",
            )

        source_account = await self.account_repository.get_by_user_id(
            user_id=user_id,
        )

        if source_account is None:
            raise TransactionProcessingError(
                "Source financial account not found.",
            )

        if destination_iban is not None:
            normalized_destination_iban = "".join(
                destination_iban.split(),
            ).upper()

            if not is_valid_iban(normalized_destination_iban):
                raise TransactionProcessingError(
                    "Invalid destination IBAN.",
                )

            destination_account = await self.account_repository.get_by_iban(
                iban=normalized_destination_iban,
            )

        else:
            if destination_email is None:
                raise TransactionProcessingError(
                    "Exactly one destination must be provided.",
                )

            normalized_destination_email = destination_email.strip().lower()

            destination_user = await self.user_repository.get_by_email(
                normalized_destination_email,
            )

            if destination_user is None or not destination_user.is_active:
                raise TransactionProcessingError(
                    "Destination user not found.",
                )

            destination_account = await self.account_repository.get_by_user_id(
                user_id=destination_user.id,
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
            reference=normalized_reference,
        )
