from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database.base import Base


class TransactionRecovery(Base):
    """Persist enough server-side state to resume an uncertain transfer."""

    __tablename__ = "transaction_recovery"

    __table_args__ = (
        UniqueConstraint(
            "source_account_id",
            "idempotency_key",
            name="uq_transaction_recovery_source_key",
        ),
        Index(
            "uq_transaction_recovery_one_processing_per_source",
            "source_account_id",
            unique=True,
            postgresql_where=text("status = 'PROCESSING'"),
        ),
        CheckConstraint(
            "status IN ('PROCESSING', 'COMPLETED', 'FAILED')",
            name="ck_transaction_recovery_status",
        ),
        CheckConstraint("amount > 0", name="ck_transaction_recovery_amount"),
        CheckConstraint(
            "transfer_method IN ('iban', 'email')",
            name="ck_transaction_recovery_method",
        ),
        CheckConstraint(
            "idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'",
            name="ck_transaction_recovery_key",
        ),
        CheckConstraint(
            "request_fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_transaction_recovery_fingerprint",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False
    )
    destination_account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False
    )
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(140), nullable=True)
    transfer_method: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="PROCESSING"
    )
    transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="RESTRICT"), nullable=True
    )
    failure_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
