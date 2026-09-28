"""add BIC to financial institutions

Revision ID: 01e839f8e8c5
Revises: 48bf7194f355
Create Date: 2026-09-28 14:03:51.411107

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "01e839f8e8c5"
down_revision: Union[str, Sequence[str], None] = "48bf7194f355"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


IDEMERAX_NAME = "Idemerax"
IDEMERAX_BIC = "IDEMDEFFXXX"


def upgrade() -> None:
    """Add BIC to financial institutions."""
    op.add_column(
        "financial_institutions",
        sa.Column("bic", sa.String(length=11), nullable=True),
    )

    op.execute(
        sa.text(
            """
            UPDATE financial_institutions
            SET bic = :bic
            WHERE name = :name
            """
        ).bindparams(
            bic=IDEMERAX_BIC,
            name=IDEMERAX_NAME,
        )
    )

    op.alter_column(
        "financial_institutions",
        "bic",
        nullable=False,
    )

    op.create_unique_constraint(
        "uq_financial_institutions_bic",
        "financial_institutions",
        ["bic"],
    )


def downgrade() -> None:
    """Remove BIC from financial institutions."""
    op.drop_constraint(
        "uq_financial_institutions_bic",
        "financial_institutions",
        type_="unique",
    )

    op.drop_column(
        "financial_institutions",
        "bic",
    )
