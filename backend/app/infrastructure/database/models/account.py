from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database.base import Base

if TYPE_CHECKING:
    from app.infrastructure.database.models.financial_institution import (
        FinancialInstitution,
    )
    from app.infrastructure.database.models.user import User


class Account(Base):
    """Represent a financial account belonging to a user."""

    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    institution_id: Mapped[int] = mapped_column(
        ForeignKey("financial_institutions.id"),
        nullable=False,
        index=True,
    )

    account_number: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        unique=True,
    )

    iban: Mapped[str] = mapped_column(
        String(22),
        nullable=False,
        unique=True,
    )

    balance: Mapped[Decimal] = mapped_column(
        Numeric(19, 4),
        nullable=False,
        default=Decimal("0.0000"),
    )

    user: Mapped["User"] = relationship(
        back_populates="accounts",
    )

    institution: Mapped["FinancialInstitution"] = relationship(
        back_populates="accounts",
    )
