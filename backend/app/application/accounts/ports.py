from typing import Protocol

from app.infrastructure.database.models.account import Account


class AccountRepositoryPort(Protocol):
    """Define account data access required by account management."""

    async def create(self, user_id: int) -> Account:
        """Create and return a new account."""
        ...
