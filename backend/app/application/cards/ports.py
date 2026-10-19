from datetime import datetime
from typing import Protocol

from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.card import Card


class CardRepositoryPort(Protocol):
    """Define card data access required by card management."""

    async def lock_user_for_card_operation(self, user_id: int) -> None: ...

    async def count_created_for_user_between(
        self, user_id: int, start: datetime, end: datetime
    ) -> int: ...

    async def count_active_for_account(self, account_id: int) -> int: ...

    async def create(self, account: Account) -> Card: ...

    async def list_for_user(self, user_id: int) -> list[Card]: ...

    async def get_by_id_for_user(self, card_id: int, user_id: int) -> Card | None: ...

    async def save(self, card: Card) -> Card: ...


class OwnedAccountRepositoryPort(Protocol):
    """Define account lookup needed to validate card ownership."""

    async def get_by_id_for_user(
        self, account_id: int, user_id: int
    ) -> Account | None: ...
