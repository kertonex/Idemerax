from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database.base import Base


class Card(Base):
    """Represent a payment card."""

    __tablename__ = "cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    card_type: Mapped[str] = mapped_column(String(50), nullable=False)
