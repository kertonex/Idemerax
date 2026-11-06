from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.transaction_recovery import TransactionRecovery


class TransactionRecoveryRepository:
    """Read and persist durable transfer recovery records."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_key(
        self,
        source_account_id: int,
        idempotency_key: str,
        *,
        for_update: bool = False,
    ) -> TransactionRecovery | None:
        statement = select(TransactionRecovery).where(
            TransactionRecovery.source_account_id == source_account_id,
            TransactionRecovery.idempotency_key == idempotency_key,
        )
        if for_update:
            statement = statement.with_for_update().execution_options(
                populate_existing=True
            )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_pending_for_user(
        self, user_id: int
    ) -> tuple[TransactionRecovery, Account] | None:
        result = await self.session.execute(
            select(TransactionRecovery, Account)
            .join(Account, Account.id == TransactionRecovery.destination_account_id)
            .where(
                TransactionRecovery.source_account_id.in_(
                    select(Account.id).where(Account.user_id == user_id)
                ),
                TransactionRecovery.status == "PROCESSING",
            )
            .options(selectinload(Account.user))
            .order_by(TransactionRecovery.created_at.asc())
            .limit(1)
        )
        row = result.first()
        return (row[0], row[1]) if row else None

    async def get_owned_operation(
        self,
        user_id: int,
        idempotency_key: str,
        *,
        for_update: bool = False,
    ) -> tuple[TransactionRecovery, Account] | None:
        statement = (
            select(TransactionRecovery, Account)
            .join(
                Account,
                Account.id == TransactionRecovery.destination_account_id,
            )
            .where(
                TransactionRecovery.source_account_id.in_(
                    select(Account.id).where(Account.user_id == user_id)
                ),
                TransactionRecovery.idempotency_key == idempotency_key,
            )
            .options(selectinload(Account.user))
        )
        if for_update:
            statement = statement.with_for_update(
                of=TransactionRecovery
            ).execution_options(populate_existing=True)
        result = await self.session.execute(statement)
        row = result.first()
        return (row[0], row[1]) if row else None

    async def create(self, operation: TransactionRecovery) -> None:
        self.session.add(operation)
        await self.session.flush()
