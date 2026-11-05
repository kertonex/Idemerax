from decimal import Decimal
from typing import Literal

from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.transaction import Transaction

TransactionDirection = Literal["incoming", "outgoing"]


class IdempotencyPersistenceConflictError(Exception):
    """Raise when an idempotency uniqueness constraint is violated."""


class TransactionRepository:
    """Provide database access for transactions and transaction history."""

    IDEMPOTENCY_CONSTRAINT_NAME = "uq_transactions_source_idempotency_key"

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
        *,
        idempotency_key: str,
        request_fingerprint: str,
    ) -> Transaction:
        """Create and flush a transaction without committing the session."""
        transaction = Transaction(
            source_account_id=source_account_id,
            destination_account_id=destination_account_id,
            amount=amount,
            transaction_type=transaction_type,
            status=status,
            reference=reference,
            transfer_method=transfer_method,
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
        )

        self.session.add(transaction)

        try:
            await self.session.flush()
        except IntegrityError as exc:
            if self._is_idempotency_constraint_violation(exc):
                # The transaction owner must roll back before reusing the
                # failed session or issuing another database query.
                raise IdempotencyPersistenceConflictError(
                    "A transaction already exists for this idempotency key."
                ) from exc

            raise

        return transaction

    async def get_by_id(self, transaction_id: int | None) -> Transaction | None:
        """Return a transaction by its primary key."""
        if transaction_id is None:
            return None
        result = await self.session.execute(
            select(Transaction).where(Transaction.id == transaction_id)
        )
        return result.scalar_one_or_none()

    async def get_by_idempotency_key(
        self,
        source_account_id: int,
        idempotency_key: str,
    ) -> Transaction | None:
        """Find a transaction by source account and idempotency key."""
        result = await self.session.execute(
            select(Transaction).where(
                Transaction.source_account_id == source_account_id,
                Transaction.idempotency_key == idempotency_key,
            )
        )

        return result.scalar_one_or_none()

    @classmethod
    def _is_idempotency_constraint_violation(
        cls,
        error: IntegrityError,
    ) -> bool:
        """Identify only violations of the idempotency unique constraint."""
        original_error = error.orig
        constraint_name = getattr(original_error, "constraint_name", None)

        if constraint_name == cls.IDEMPOTENCY_CONSTRAINT_NAME:
            return True

        # Some PostgreSQL drivers expose the constraint through diagnostic
        # information instead of a direct attribute on the original error.
        diagnostic = getattr(original_error, "diag", None)
        diagnostic_constraint_name = getattr(
            diagnostic,
            "constraint_name",
            None,
        )

        return diagnostic_constraint_name == cls.IDEMPOTENCY_CONSTRAINT_NAME

    async def list_for_user(
        self,
        user_id: int,
        limit: int,
        offset: int,
    ) -> tuple[list[tuple[Transaction, TransactionDirection]], int]:
        """Return the user's transactions newest first with counterparty data."""
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
            .join(
                source_account,
                Transaction.source_account_id == source_account.id,
            )
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
            .join(
                source_account,
                Transaction.source_account_id == source_account.id,
            )
            .join(
                destination_account,
                Transaction.destination_account_id == destination_account.id,
            )
            .where(ownership_filter)
            .options(
                selectinload(
                    Transaction.source_account,
                ).selectinload(Account.user),
                selectinload(
                    Transaction.destination_account,
                ).selectinload(Account.user),
            )
            .order_by(
                Transaction.created_at.desc(),
                Transaction.id.desc(),
            )
            .limit(limit)
            .offset(offset)
        )

        result = await self.session.execute(statement)

        transactions: list[tuple[Transaction, TransactionDirection]] = [
            (transaction, transaction_direction)
            for transaction, transaction_direction in result.all()
        ]

        return transactions, total
