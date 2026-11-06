"""Add durable transaction recovery records.

Revision ID: ce71b4a09d32
Revises: b4e81c2a9f63
Create Date: 2026-10-30
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "ce71b4a09d32"
down_revision: Union[str, Sequence[str], None] = "b4e81c2a9f63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transaction_recovery",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "source_account_id",
            sa.Integer(),
            sa.ForeignKey("accounts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "destination_account_id",
            sa.Integer(),
            sa.ForeignKey("accounts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("amount", sa.Numeric(19, 4), nullable=False),
        sa.Column("reference", sa.String(140), nullable=True),
        sa.Column("transfer_method", sa.String(10), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="PROCESSING"),
        sa.Column(
            "transaction_id",
            sa.Integer(),
            sa.ForeignKey("transactions.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("failure_code", sa.String(40), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "source_account_id",
            "idempotency_key",
            name="uq_transaction_recovery_source_key",
        ),
        sa.CheckConstraint(
            "status IN ('PROCESSING', 'COMPLETED', 'FAILED')",
            name="ck_transaction_recovery_status",
        ),
        sa.CheckConstraint("amount > 0", name="ck_transaction_recovery_amount"),
        sa.CheckConstraint(
            "transfer_method IN ('iban', 'email')",
            name="ck_transaction_recovery_method",
        ),
        sa.CheckConstraint(
            "idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'",
            name="ck_transaction_recovery_key",
        ),
        sa.CheckConstraint(
            "request_fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_transaction_recovery_fingerprint",
        ),
    )
    op.create_index(
        "uq_transaction_recovery_one_processing_per_source",
        "transaction_recovery",
        ["source_account_id"],
        unique=True,
        postgresql_where=sa.text("status = 'PROCESSING'"),
    )
    op.create_index(
        "ix_transaction_recovery_destination_account_id",
        "transaction_recovery",
        ["destination_account_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_transaction_recovery_destination_account_id",
        table_name="transaction_recovery",
    )
    op.drop_index(
        "uq_transaction_recovery_one_processing_per_source",
        table_name="transaction_recovery",
    )
    op.drop_table("transaction_recovery")
