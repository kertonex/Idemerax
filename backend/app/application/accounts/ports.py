from typing import Protocol

from app.infrastructure.database.models.account import Account


class AccountRepositoryPort(Protocol):
    """Define account data access required by account management and processing."""

    async def create(self, user_id: int) -> Account:
        """Create and return a new account."""
        ...

    async def get_by_account_number(
        self,
        account_number: str,
    ) -> Account | None:
        """Return an account matching the account number."""
        ...

    async def get_by_user_id(self, user_id: int) -> Account | None:
        """Return the account belonging to the user."""
        ...

    async def get_by_iban(self, iban: str) -> Account | None:
        """Return an account matching the IBAN."""
        ...

    async def lock_for_transfer(
        self,
        account_ids: list[int],
    ) -> list[Account]:
        """Lock and return accounts for an atomic transfer."""
        ...
