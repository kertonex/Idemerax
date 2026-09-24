from datetime import datetime
from typing import Protocol

from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.refresh_session import RefreshSession
from app.infrastructure.database.models.user import User


class UserRepositoryPort(Protocol):
    """Define user data access required by authentication."""

    async def get_by_email(self, email: str) -> User | None:
        """Return a user by email address."""
        ...

    async def get_by_id(self, user_id: int) -> User | None:
        """Return a user by ID."""
        ...

    async def create(self, email: str, password_hash: str) -> User:
        """Create and return a new user."""
        ...


class AccountRepositoryPort(Protocol):
    """Define account data access required by account management."""

    async def create(self, user_id: int) -> Account:
        """Create and return a new account."""
        ...


class RefreshSessionRepositoryPort(Protocol):
    """Define refresh session data access required by authentication."""

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
        """Create and return a new refresh session."""
        ...

    async def delete(self, refresh_session_id: int) -> None:
        """Delete a refresh session."""
        ...
