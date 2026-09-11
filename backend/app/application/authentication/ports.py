from typing import Protocol

from app.infrastructure.database.models.user import User


class UserRepositoryPort(Protocol):
    """Define user data access required by authentication."""

    async def get_by_email(self, email: str) -> User | None:
        """Return a user by email address."""
        ...
