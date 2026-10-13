"""add user settings

Revision ID: 40d8c0c8004e
Revises: 6f496da523cc
Create Date: 2026-10-07 16:35:08.009025

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "40d8c0c8004e"
down_revision: Union[str, Sequence[str], None] = "6f496da523cc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column("first_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("last_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "language",
            sa.String(length=5),
            nullable=False,
            server_default="en",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "theme",
            sa.String(length=20),
            nullable=False,
            server_default="system",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_transaction_completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_money_received",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_transaction_failed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "notify_transaction_failed")
    op.drop_column("users", "notify_money_received")
    op.drop_column("users", "notify_transaction_completed")
    op.drop_column("users", "theme")
    op.drop_column("users", "language")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
