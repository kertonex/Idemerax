"""create transactions table

Revision ID: f67e7de5a683
Revises: 6ea8b18c6f37
Create Date: 2026-09-29 18:12:25.416704

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# Revision identifiers, used by Alembic.
revision: str = "f67e7de5a683"
down_revision: Union[str, Sequence[str], None] = "6ea8b18c6f37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "transactions",
        sa.Column(
            "source_account_id",
            sa.Integer(),
            nullable=False,
        ),
    )
    op.add_column(
        "transactions",
        sa.Column(
            "destination_account_id",
            sa.Integer(),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_transactions_destination_account_id",
        "transactions",
        ["destination_account_id"],
        unique=False,
    )
    op.create_index(
        "ix_transactions_source_account_id",
        "transactions",
        ["source_account_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_transactions_source_account_id",
        "transactions",
        "accounts",
        ["source_account_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_transactions_destination_account_id",
        "transactions",
        "accounts",
        ["destination_account_id"],
        ["id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "fk_transactions_destination_account_id",
        "transactions",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_transactions_source_account_id",
        "transactions",
        type_="foreignkey",
    )

    op.drop_index(
        "ix_transactions_destination_account_id",
        table_name="transactions",
    )
    op.drop_index(
        "ix_transactions_source_account_id",
        table_name="transactions",
    )

    op.drop_column(
        "transactions",
        "destination_account_id",
    )
    op.drop_column(
        "transactions",
        "source_account_id",
    )
