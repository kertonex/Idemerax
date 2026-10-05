from decimal import Decimal
from typing import Protocol

from app.infrastructure.database.models.transaction import Transaction
from app.infrastructure.database.models.user import User


class TransactionRepositoryPort(Protocol):
    """Define transaction data access required by transaction processing."""

    async def create(
        self,
        source_account_id: int,
        destination_account_id: int,
        amount: Decimal,
        transaction_type: str,
        status: str,
        reference: str | None = None,
    ) -> Transaction:
        """Create and return a transaction without committing."""
        ...


class UserRepositoryPort(Protocol):
    """Define user data access required by transaction processing."""

    async def get_by_email(self, email: str) -> User | None:
        """Return a user by email address."""
        ...
