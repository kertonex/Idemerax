from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models.transaction import Transaction


class TransactionRepository:
    """Provide database access for transactions."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        source_account_id: int,
        destination_account_id: int,
        amount: Decimal,
        transaction_type: str,
        status: str,
    ) -> Transaction:
        """Create and return a transaction without committing the session."""
        transaction = Transaction(
            source_account_id=source_account_id,
            destination_account_id=destination_account_id,
            amount=amount,
            transaction_type=transaction_type,
            status=status,
        )

        self.session.add(transaction)

        # Flush to persist the transaction within the caller's database transaction.
        await self.session.flush()

        return transaction
