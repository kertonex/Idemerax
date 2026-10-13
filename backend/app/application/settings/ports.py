from typing import Protocol

from app.infrastructure.database.models.user import User


class SettingsRepositoryPort(Protocol):
    """Define user settings data access."""

    async def get_by_user_id(self, user_id: int) -> User | None:
        """Return settings for a user."""
        ...

    async def update_profile(
        self,
        user_id: int,
        first_name: str,
        last_name: str,
    ) -> User:
        """Update the user's required profile information."""
        ...

    async def update_preferences(
        self,
        user_id: int,
        language: str,
        theme: str,
    ) -> User:
        """Update the user's application preferences."""
        ...

    async def update_notifications(
        self,
        user_id: int,
        notify_transaction_completed: bool,
        notify_money_received: bool,
        notify_transaction_failed: bool,
    ) -> User:
        """Update the user's notification preferences."""
        ...

    async def update_password(
        self,
        user_id: int,
        password_hash: str,
    ) -> User:
        """Update the user's password hash."""
        ...
