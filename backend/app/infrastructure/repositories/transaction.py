from decimal import Decimal
from typing import Literal

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.transaction import Transaction

TransactionDirection = Literal["incoming", "outgoing"]


class TransactionRepository:
    """Provide database access for transactions and their history metadata."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        source_account_id: int,
        destination_account_id: int,
        amount: Decimal,
        transaction_type: str,
        status: str,
        reference: str | None = None,
        transfer_method: str | None = None,
    ) -> Transaction:
        """Create and return a transaction without committing the session."""
        transaction = Transaction(
            source_account_id=source_account_id,
            destination_account_id=destination_account_id,
            amount=amount,
            transaction_type=transaction_type,
            status=status,
            reference=reference,
            transfer_method=transfer_method,
        )
        self.session.add(transaction)
        await self.session.flush()
        return transaction

    async def list_for_user(
        self,
        user_id: int,
        limit: int,
        offset: int,
    ) -> tuple[list[tuple[Transaction, TransactionDirection]], int]:
        """Return the user's transactions newest first with counterparty data loaded."""
        source_account = aliased(Account)
        destination_account = aliased(Account)
        ownership_filter = or_(
            source_account.user_id == user_id,
            destination_account.user_id == user_id,
        )
        direction = case(
            (source_account.user_id == user_id, "outgoing"),
            else_="incoming",
        ).label("direction")
        count_statement = (
            select(func.count(Transaction.id))
            .select_from(Transaction)
            .join(source_account, Transaction.source_account_id == source_account.id)
            .join(
                destination_account,
                Transaction.destination_account_id == destination_account.id,
            )
            .where(ownership_filter)
        )
        total_result = await self.session.execute(count_statement)
        total = total_result.scalar_one()
        statement = (
            select(Transaction, direction)
            .join(source_account, Transaction.source_account_id == source_account.id)
            .join(
                destination_account,
                Transaction.destination_account_id == destination_account.id,
            )
            .where(ownership_filter)
            .options(
                selectinload(Transaction.source_account).selectinload(Account.user),
                selectinload(Transaction.destination_account).selectinload(
                    Account.user
                ),
            )
            .order_by(Transaction.created_at.desc(), Transaction.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(statement)
        transactions: list[tuple[Transaction, TransactionDirection]] = [
            (transaction, transaction_direction)
            for transaction, transaction_direction in result.all()
        ]
        return transactions, total
