"""Add transfer method to transactions.

Revision ID: c77d75119cea
Revises: a6a49617d28b
Create Date: 2026-10-14 14:10:38.824145
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# Revision identifiers used by Alembic.
revision: str = "c77d75119cea"
down_revision: Union[str, Sequence[str], None] = "a6a49617d28b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the optional transfer method column."""
    op.add_column(
        "transactions",
        sa.Column(
            "transfer_method",
            sa.String(length=10),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Remove the transfer method column."""
    op.drop_column(
        "transactions",
        "transfer_method",
    )
