from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models.account import Account


class AccountRepository:
    """Provide database access for accounts."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, user_id: int) -> Account:
        """Create and return a new account."""
        account = Account(user_id=user_id)
        self.session.add(account)
        await self.session.flush()
        return account

    async def get_by_user_id(self, user_id: int) -> Account | None:
        """Return the account belonging to a user."""
        result = await self.session.execute(
            select(Account).where(Account.user_id == user_id)
        )
        return result.scalar_one_or_none()
