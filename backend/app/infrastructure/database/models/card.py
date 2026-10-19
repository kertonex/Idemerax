from datetime import datetime
from secrets import randbelow
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database.base import Base

if TYPE_CHECKING:
    from app.infrastructure.database.models.account import Account


class Card(Base):
    """Represent a virtual demo debit card linked to a financial account."""

    __tablename__ = "cards"
    __table_args__ = (
        CheckConstraint(
            "status IN ('ACTIVE', 'INACTIVE', 'CLOSED')",
            name="ck_cards_status",
        ),
        CheckConstraint(
            "(status = 'CLOSED' AND closed_at IS NOT NULL) "
            "OR (status <> 'CLOSED' AND closed_at IS NULL)",
            name="ck_cards_closed_timestamp",
        ),
        CheckConstraint(
            "card_type = 'VIRTUAL_DEBIT'",
            name="ck_cards_card_type",
        ),
        CheckConstraint(
            "last_four ~ '^[0-9]{4}$'",
            name="ck_cards_last_four_digits",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    account_id: Mapped[int] = mapped_column(
        ForeignKey(
            "accounts.id",
            name="fk_cards_account_id_accounts",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    card_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="VIRTUAL_DEBIT",
    )

    last_four: Mapped[str] = mapped_column(
        String(4),
        nullable=False,
        default=lambda: f"{randbelow(10_000):04d}",
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="ACTIVE",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    account: Mapped["Account"] = relationship(back_populates="cards")
