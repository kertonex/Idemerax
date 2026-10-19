"""Add account linking and required fields to cards.

Revision ID: d2a7f41c9b60
Revises: c77d75119cea
Create Date: 2026-10-16
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d2a7f41c9b60"
down_revision: Union[str, Sequence[str], None] = "c77d75119cea"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add account linking and required fields to existing cards."""

    op.add_column(
        "cards",
        sa.Column("account_id", sa.Integer(), nullable=False),
    )

    op.add_column(
        "cards",
        sa.Column("last_four", sa.String(length=4), nullable=False),
    )

    op.add_column(
        "cards",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_foreign_key(
        "fk_cards_account_id_accounts",
        "cards",
        "accounts",
        ["account_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_index(
        "ix_cards_account_id",
        "cards",
        ["account_id"],
    )

    op.create_check_constraint(
        "ck_cards_status",
        "cards",
        "status IN ('ACTIVE', 'INACTIVE')",
    )

    op.create_check_constraint(
        "ck_cards_card_type",
        "cards",
        "card_type = 'VIRTUAL_DEBIT'",
    )

    op.create_check_constraint(
        "ck_cards_last_four_digits",
        "cards",
        "last_four ~ '^[0-9]{4}$'",
    )


def downgrade() -> None:
    """Remove the added card fields and constraints."""

    op.drop_constraint(
        "ck_cards_last_four_digits",
        "cards",
        type_="check",
    )

    op.drop_constraint(
        "ck_cards_card_type",
        "cards",
        type_="check",
    )

    op.drop_constraint(
        "ck_cards_status",
        "cards",
        type_="check",
    )

    op.drop_index(
        "ix_cards_account_id",
        table_name="cards",
    )

    op.drop_constraint(
        "fk_cards_account_id_accounts",
        "cards",
        type_="foreignkey",
    )

    op.drop_column("cards", "created_at")
    op.drop_column("cards", "last_four")
    op.drop_column("cards", "account_id")
