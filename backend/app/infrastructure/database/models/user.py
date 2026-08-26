from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database.base import Base

if TYPE_CHECKING:
    from app.infrastructure.database.models.account import Account


class User(Base):
    """Represent an application user."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
    )

    accounts: Mapped[list["Account"]] = relationship(
        back_populates="user",
    )
