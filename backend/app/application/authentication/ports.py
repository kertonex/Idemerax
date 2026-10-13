from datetime import datetime
from typing import Protocol

from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.refresh_session import RefreshSession
from app.infrastructure.database.models.user import User


class UserRepositoryPort(Protocol):
    """Define user data access operations."""

    async def get_by_email(self, email: str) -> User | None:
        """Return a user by email address."""
        ...

    async def get_by_id(self, user_id: int) -> User | None:
        """Return a user by ID."""
        ...

    async def create(self, email: str, password_hash: str) -> User:
        """Create a new user."""
        ...


class AccountRepositoryPort(Protocol):
    """Define account data access operations."""

    async def create(self, user_id: int) -> Account:
        """Create a financial account for a user."""
        ...


class RefreshSessionRepositoryPort(Protocol):
    """Define refresh-session data access operations."""

    async def get_by_token_hash(
        self,
        token_hash: str,
    ) -> RefreshSession | None:
        """Return a refresh session by token hash."""
        ...

    async def create(
        self,
        user_id: int,
        token_hash: str,
        expires_at: datetime,
    ) -> RefreshSession:
        """Create a refresh session."""
        ...

    async def delete(self, refresh_session_id: int) -> None:
        """Delete a refresh session."""
        ...

    async def delete_all_by_user_id(self, user_id: int) -> None:
        """Delete all refresh sessions belonging to a user."""
        ...
