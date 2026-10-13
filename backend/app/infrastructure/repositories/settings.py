from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models.user import User


class SettingsRepository:
    """Provide database access for user settings."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_user_id(self, user_id: int) -> User | None:
        """Return settings for a user."""
        result = await self.session.execute(
            select(User).where(User.id == user_id),
        )

        return result.scalar_one_or_none()

    async def update_profile(
        self,
        user_id: int,
        first_name: str,
        last_name: str,
    ) -> User:
        """Update the user's required profile information."""
        user = await self.get_by_user_id(user_id)

        if user is None:
            raise ValueError("User not found.")

        user.first_name = first_name
        user.last_name = last_name

        await self.session.flush()

        return user

    async def update_preferences(
        self,
        user_id: int,
        language: str,
        theme: str,
    ) -> User:
        """Update the user's application preferences."""
        user = await self.get_by_user_id(user_id)

        if user is None:
            raise ValueError("User not found.")

        user.language = language
        user.theme = theme

        await self.session.flush()

        return user

    async def update_notifications(
        self,
        user_id: int,
        notify_transaction_completed: bool,
        notify_money_received: bool,
        notify_transaction_failed: bool,
    ) -> User:
        """Update the user's notification preferences."""
        user = await self.get_by_user_id(user_id)

        if user is None:
            raise ValueError("User not found.")

        user.notify_transaction_completed = notify_transaction_completed
        user.notify_money_received = notify_money_received
        user.notify_transaction_failed = notify_transaction_failed

        await self.session.flush()

        return user

    async def update_password(
        self,
        user_id: int,
        password_hash: str,
    ) -> User:
        """Update the user's password hash."""
        user = await self.get_by_user_id(user_id)

        if user is None:
            raise ValueError("User not found.")

        user.password_hash = password_hash

        await self.session.flush()

        return user
