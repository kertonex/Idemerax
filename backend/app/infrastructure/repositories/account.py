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
