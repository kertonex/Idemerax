"""create refresh sessions table

Revision ID: 1760345b3dca
Revises: c305d0979ce3
Create Date: 2026-09-17 16:17:30.983521

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1760345b3dca"
down_revision: Union[str, Sequence[str], None] = "c305d0979ce3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the refresh sessions table."""
    op.create_table(
        "refresh_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )

    op.create_index(
        op.f("ix_refresh_sessions_user_id"),
        "refresh_sessions",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Drop the refresh sessions table."""
    op.drop_index(
        op.f("ix_refresh_sessions_user_id"),
        table_name="refresh_sessions",
    )
    op.drop_table("refresh_sessions")
