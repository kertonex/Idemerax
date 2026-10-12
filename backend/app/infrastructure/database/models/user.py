from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database.base import Base

if TYPE_CHECKING:
    from app.infrastructure.database.models.account import Account
    from app.infrastructure.database.models.refresh_session import RefreshSession


class User(Base):
    """Represent an application user."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)

    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
    )

    password_hash: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="USER",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    first_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    last_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    language: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="en",
    )

    theme: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="system",
    )

    notify_transaction_completed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    notify_money_received: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    notify_transaction_failed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    accounts: Mapped[list["Account"]] = relationship(
        back_populates="user",
    )

    refresh_sessions: Mapped[list["RefreshSession"]] = relationship(
        cascade="all, delete-orphan",
        back_populates="user",
    )

    @property
    def profile_complete(self) -> bool:
        """Return whether the required profile information is complete."""
        return bool(
            self.first_name
            and self.first_name.strip()
            and self.last_name
            and self.last_name.strip()
        )
