"""add transaction creation timestamp default

Revision ID: bcaa4b03d316
Revises: f67e7de5a683
Create Date: 2026-09-30 14:29:50.529208

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bcaa4b03d316"
down_revision: Union[str, Sequence[str], None] = "f67e7de5a683"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add a database default for transaction creation timestamps."""
    op.alter_column(
        "transactions",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        existing_nullable=False,
    )


def downgrade() -> None:
    """Remove the database default for transaction creation timestamps."""
    op.alter_column(
        "transactions",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        server_default=None,
        existing_nullable=False,
    )
