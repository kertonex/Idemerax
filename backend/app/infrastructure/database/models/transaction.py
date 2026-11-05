from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database.base import Base

if TYPE_CHECKING:
    from app.infrastructure.database.models.account import Account


class Transaction(Base):
    """Represent a financial transaction between two accounts."""

    __tablename__ = "transactions"

    __table_args__ = (
        UniqueConstraint(
            "source_account_id",
            "idempotency_key",
            name="uq_transactions_source_idempotency_key",
        ),
        CheckConstraint(
            "(idempotency_key IS NULL AND request_fingerprint IS NULL) OR "
            "(idempotency_key IS NOT NULL AND request_fingerprint IS NOT NULL)",
            name="ck_transactions_idempotency_metadata_pair",
        ),
        CheckConstraint(
            "idempotency_key IS NULL OR length(idempotency_key) BETWEEN 1 AND 128",
            name="ck_transactions_idempotency_key_length",
        ),
        CheckConstraint(
            "idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'",
            name="ck_transactions_idempotency_key_format",
        ),
        CheckConstraint(
            "request_fingerprint IS NULL OR request_fingerprint ~ '^[0-9a-fA-F]{64}$'",
            name="ck_transactions_fingerprint_format",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    source_account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id"),
        nullable=False,
        index=True,
    )

    destination_account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id"),
        nullable=False,
        index=True,
    )

    amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4),
        nullable=False,
    )

    reference: Mapped[str | None] = mapped_column(
        String(140),
        nullable=True,
    )

    transaction_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    # Nullable to preserve compatibility with historical transactions.
    idempotency_key: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )

    request_fingerprint: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    transfer_method: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    source_account: Mapped["Account"] = relationship(
        foreign_keys=[source_account_id],
        back_populates="source_transactions",
    )

    destination_account: Mapped["Account"] = relationship(
        foreign_keys=[destination_account_id],
        back_populates="destination_transactions",
    )
