from decimal import Decimal
from typing import Protocol

from app.infrastructure.database.models.transaction import Transaction


class TransactionRepositoryPort(Protocol):
    """Define transaction data access required by transaction processing."""

    async def create(
        self,
        source_account_id: int,
        destination_account_id: int,
        amount: Decimal,
        transaction_type: str,
        status: str,
    ) -> Transaction:
        """Create and return a transaction without committing."""
        ...
