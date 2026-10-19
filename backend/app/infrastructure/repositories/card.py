from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.card import Card
from app.infrastructure.database.models.user import User


class CardRepository:
    """Provide database access for virtual demo cards."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def lock_user_for_card_operation(self, user_id: int) -> None:
        """Serialize card mutations for one user until transaction completion."""
        result = await self.session.execute(
            select(User.id).where(User.id == user_id).with_for_update()
        )
        if result.scalar_one_or_none() is None:
            raise RuntimeError("Authenticated user no longer exists.")

    async def count_created_for_user_between(
        self,
        user_id: int,
        start: datetime,
        end: datetime,
    ) -> int:
        """Count all created cards in a UTC interval, including closed cards."""
        result = await self.session.execute(
            select(func.count(Card.id))
            .join(Account, Card.account_id == Account.id)
            .where(
                Account.user_id == user_id,
                Card.created_at >= start,
                Card.created_at < end,
            )
        )
        return int(result.scalar_one())

    async def count_active_for_account(self, account_id: int) -> int:
        """Count active cards linked to one financial account."""
        result = await self.session.execute(
            select(func.count(Card.id)).where(
                Card.account_id == account_id,
                Card.status == "ACTIVE",
            )
        )
        return int(result.scalar_one())

    async def create(self, account: Account) -> Card:
        """Create an active virtual demo card linked to an account."""
        card = Card(account=account, card_type="VIRTUAL_DEBIT", status="ACTIVE")
        self.session.add(card)
        await self.session.flush()
        # Load the related institution before the API serializes the response.
        await self.session.refresh(card, attribute_names=["created_at"])
        return card

    async def list_for_user(self, user_id: int) -> list[Card]:
        """Return cards only when their linked account belongs to the user."""
        result = await self.session.execute(
            select(Card)
            .join(Account, Card.account_id == Account.id)
            .options(
                selectinload(Card.account).selectinload(Account.institution),
            )
            .where(Account.user_id == user_id)
            .order_by(Card.created_at.desc(), Card.id.desc())
        )
        return list(result.scalars().all())

    async def get_by_id_for_user(self, card_id: int, user_id: int) -> Card | None:
        """Return a card only when its linked account belongs to the user."""
        result = await self.session.execute(
            select(Card)
            .join(Account, Card.account_id == Account.id)
            .options(
                selectinload(Card.account).selectinload(Account.institution),
            )
            .where(Card.id == card_id, Account.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def save(self, card: Card) -> Card:
        """Persist a card update."""
        await self.session.flush()
        return card
