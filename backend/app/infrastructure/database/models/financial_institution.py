from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database.base import Base

if TYPE_CHECKING:
    from app.infrastructure.database.models.account import Account


class FinancialInstitution(Base):
    """Represent the financial institution operating Idemerax accounts."""

    __tablename__ = "financial_institutions"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
    )

    bank_code: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        unique=True,
    )

    accounts: Mapped[list["Account"]] = relationship(
        back_populates="institution",
    )
