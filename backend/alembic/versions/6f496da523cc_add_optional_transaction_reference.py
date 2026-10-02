"""add optional transaction reference"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6f496da523cc"
down_revision: Union[str, Sequence[str], None] = "bcaa4b03d316"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add an optional reference to transactions."""
    op.add_column(
        "transactions",
        sa.Column("reference", sa.String(length=140), nullable=True),
    )


def downgrade() -> None:
    """Remove the optional transaction reference."""
    op.drop_column("transactions", "reference")
