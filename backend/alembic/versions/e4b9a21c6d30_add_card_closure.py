"""Add permanent card closure metadata.

Revision ID: e4b9a21c6d30
Revises: d2a7f41c9b60
Create Date: 2026-10-17
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "e4b9a21c6d30"
down_revision: Union[str, Sequence[str], None] = "d2a7f41c9b60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Allow closed cards and record when they were closed."""
    op.drop_constraint("ck_cards_status", "cards", type_="check")
    op.create_check_constraint(
        "ck_cards_status",
        "cards",
        "status IN ('ACTIVE', 'INACTIVE', 'CLOSED')",
    )
    op.add_column(
        "cards",
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_cards_closed_timestamp",
        "cards",
        (
            "(status = 'CLOSED' AND closed_at IS NOT NULL) "
            "OR (status <> 'CLOSED' AND closed_at IS NULL)"
        ),
    )


def downgrade() -> None:
    """Restore the previous schema only if no cards have been closed."""
    closed_count = (
        op.get_bind()
        .execute(sa.text("SELECT COUNT(*) FROM cards WHERE status = 'CLOSED'"))
        .scalar_one()
    )
    if closed_count:
        raise RuntimeError(
            "Cannot downgrade card closure while CLOSED cards exist. "
            "Reopen/reconcile these records before retrying."
        )
    op.drop_constraint("ck_cards_closed_timestamp", "cards", type_="check")
    op.drop_column("cards", "closed_at")
    op.drop_constraint("ck_cards_status", "cards", type_="check")
    op.create_check_constraint(
        "ck_cards_status",
        "cards",
        "status IN ('ACTIVE', 'INACTIVE')",
    )
