"""add refresh session last activity timestamp

Revision ID: d9f2c4a81b67
Revises: ce71b4a09d32
Create Date: 2026-11-14 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d9f2c4a81b67"
down_revision: Union[str, Sequence[str], None] = "ce71b4a09d32"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add a server-managed timestamp for session inactivity enforcement."""
    op.add_column(
        "refresh_sessions",
        sa.Column(
            "last_activity_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Remove the refresh-session activity timestamp."""
    op.drop_column("refresh_sessions", "last_activity_at")
