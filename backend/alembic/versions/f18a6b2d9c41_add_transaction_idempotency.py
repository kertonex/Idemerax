"""Add transaction idempotency metadata.

Revision ID: f18a6b2d9c41
Revises: e4b9a21c6d30
Create Date: 2026-10-20
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# Revision identifiers, used by Alembic.
revision: str = "f18a6b2d9c41"
down_revision: Union[str, Sequence[str], None] = "e4b9a21c6d30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "transactions",
        sa.Column(
            "idempotency_key",
            sa.String(length=128),
            nullable=True,
        ),
    )
    op.add_column(
        "transactions",
        sa.Column(
            "request_fingerprint",
            sa.String(length=64),
            nullable=True,
        ),
    )

    op.create_unique_constraint(
        "uq_transactions_source_idempotency_key",
        "transactions",
        ["source_account_id", "idempotency_key"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "uq_transactions_source_idempotency_key",
        "transactions",
        type_="unique",
    )
    op.drop_column(
        "transactions",
        "request_fingerprint",
    )
    op.drop_column(
        "transactions",
        "idempotency_key",
    )
