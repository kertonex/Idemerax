from datetime import UTC, datetime, timedelta
from typing import Literal

from app.application.cards.ports import (
    CardRepositoryPort,
    OwnedAccountRepositoryPort,
)
from app.infrastructure.database.models.card import Card

CardStatus = Literal["ACTIVE", "INACTIVE", "CLOSED"]
MAX_CARDS_CREATED_PER_DAY = 3
MAX_CARDS_CREATED_PER_YEAR = 20
MAX_ACTIVE_CARDS_PER_ACCOUNT = 3


class CardManagementError(Exception):
    """Raise when a card management operation cannot be completed."""


class FinancialAccountNotFoundError(CardManagementError):
    """Raise when the requested account is not owned by the user."""


class CardNotFoundError(CardManagementError):
    """Raise when the requested card is not owned by the user."""


class CardLimitExceededError(CardManagementError):
    """Raise when a card creation or activation limit would be exceeded."""


class ManageCards:
    """Manage virtual demo debit cards with ownership and lifecycle rules."""

    def __init__(
        self,
        card_repository: CardRepositoryPort,
        account_repository: OwnedAccountRepositoryPort,
    ) -> None:
        self.card_repository = card_repository
        self.account_repository = account_repository

    async def create(self, user_id: int, account_id: int) -> Card:
        """Create a card if daily, yearly, and active-account limits allow it."""
        # This row lock serializes card mutations for this user. The lock must be
        # held until the request transaction commits/rolls back.
        await self.card_repository.lock_user_for_card_operation(user_id)
        account = await self.account_repository.get_by_id_for_user(
            account_id=account_id,
            user_id=user_id,
        )
        if account is None:
            raise FinancialAccountNotFoundError("Financial account not found.")

        now = datetime.now(UTC)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        year_start = now.replace(
            month=1,
            day=1,
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        year_end = year_start.replace(year=year_start.year + 1)

        daily_count = await self.card_repository.count_created_for_user_between(
            user_id=user_id,
            start=day_start,
            end=day_end,
        )
        if daily_count >= MAX_CARDS_CREATED_PER_DAY:
            raise CardLimitExceededError(
                "Daily card creation limit reached (3 cards per UTC day)."
            )

        yearly_count = await self.card_repository.count_created_for_user_between(
            user_id=user_id,
            start=year_start,
            end=year_end,
        )
        if yearly_count >= MAX_CARDS_CREATED_PER_YEAR:
            raise CardLimitExceededError(
                "Annual card creation limit reached (20 cards per UTC calendar year)."
            )

        active_count = await self.card_repository.count_active_for_account(account.id)
        if active_count >= MAX_ACTIVE_CARDS_PER_ACCOUNT:
            raise CardLimitExceededError(
                "This financial account already has 3 active cards. "
                "Deactivate or close one first."
            )

        return await self.card_repository.create(account)

    async def list_for_user(self, user_id: int) -> list[Card]:
        """List only cards linked to accounts owned by the user."""
        return await self.card_repository.list_for_user(user_id)

    async def update_status(
        self,
        card_id: int,
        user_id: int,
        new_status: Literal["ACTIVE", "INACTIVE"],
    ) -> Card:
        """Activate or deactivate a card while respecting account limits."""
        if new_status not in ("ACTIVE", "INACTIVE"):
            raise CardManagementError("Unsupported card status.")

        await self.card_repository.lock_user_for_card_operation(user_id)
        card = await self.card_repository.get_by_id_for_user(card_id, user_id)
        if card is None:
            raise CardNotFoundError("Card not found.")

        if card.status == "CLOSED" or card.closed_at is not None:
            raise CardManagementError("A closed card cannot be reactivated or changed.")

        if card.status not in ("ACTIVE", "INACTIVE"):
            raise CardManagementError("The current card status is invalid.")

        if card.status == new_status:
            return card

        if new_status == "ACTIVE":
            active_count = await self.card_repository.count_active_for_account(
                card.account_id
            )
            if active_count >= MAX_ACTIVE_CARDS_PER_ACCOUNT:
                raise CardLimitExceededError(
                    "This financial account already has 3 active cards. "
                    "Deactivate or close one first."
                )

        card.status = new_status
        return await self.card_repository.save(card)

    async def close_card(self, card_id: int, user_id: int) -> Card:
        """Permanently close an owned card without deleting its history."""
        await self.card_repository.lock_user_for_card_operation(user_id)
        card = await self.card_repository.get_by_id_for_user(card_id, user_id)
        if card is None:
            raise CardNotFoundError("Card not found.")

        if card.status == "CLOSED":
            return card

        card.status = "CLOSED"
        card.closed_at = datetime.now(UTC)
        return await self.card_repository.save(card)
