"""create financial institution and account identifiers

Revision ID: 48bf7194f355
Revises: 1760345b3dca
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "48bf7194f355"
down_revision: Union[str, Sequence[str], None] = "1760345b3dca"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


IDEMERAX_BANK_CODE = "12345678"
IDEMERAX_NAME = "Idemerax"


def generate_iban(
    bank_code: str,
    account_number: str,
) -> str:
    """Generate a German-format IBAN for existing accounts."""
    bban = f"{bank_code}{account_number}"
    remainder = int(f"{bban}131400") % 97
    check_digits = 98 - remainder

    return f"DE{check_digits:02d}{bban}"


def upgrade() -> None:
    op.create_table(
        "financial_institutions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("bank_code", sa.String(length=8), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("bank_code"),
    )

    op.execute(
        sa.text(
            """
            INSERT INTO financial_institutions
                (name, bank_code)
            VALUES
                (:name, :bank_code)
            """
        ).bindparams(
            name=IDEMERAX_NAME,
            bank_code=IDEMERAX_BANK_CODE,
        )
    )

    op.add_column(
        "accounts",
        sa.Column("institution_id", sa.Integer(), nullable=True),
    )

    op.add_column(
        "accounts",
        sa.Column("account_number", sa.String(length=10), nullable=True),
    )

    op.add_column(
        "accounts",
        sa.Column("iban", sa.String(length=22), nullable=True),
    )

    connection = op.get_bind()

    institution_id = connection.execute(
        sa.text(
            """
            SELECT id
            FROM financial_institutions
            WHERE name = :name
            """
        ),
        {"name": IDEMERAX_NAME},
    ).scalar_one()

    accounts = connection.execute(
        sa.text(
            """
            SELECT id
            FROM accounts
            ORDER BY id
            """
        )
    ).fetchall()

    for account in accounts:
        account_number = f"{account.id:010d}"

        iban = generate_iban(
            bank_code=IDEMERAX_BANK_CODE,
            account_number=account_number,
        )

        connection.execute(
            sa.text(
                """
                UPDATE accounts
                SET institution_id = :institution_id,
                    account_number = :account_number,
                    iban = :iban
                WHERE id = :account_id
                """
            ),
            {
                "institution_id": institution_id,
                "account_number": account_number,
                "iban": iban,
                "account_id": account.id,
            },
        )

    op.alter_column(
        "accounts",
        "institution_id",
        nullable=False,
    )

    op.alter_column(
        "accounts",
        "account_number",
        nullable=False,
    )

    op.alter_column(
        "accounts",
        "iban",
        nullable=False,
    )

    op.create_foreign_key(
        "fk_accounts_institution_id",
        "accounts",
        "financial_institutions",
        ["institution_id"],
        ["id"],
    )

    op.create_unique_constraint(
        "uq_accounts_account_number",
        "accounts",
        ["account_number"],
    )

    op.create_unique_constraint(
        "uq_accounts_iban",
        "accounts",
        ["iban"],
    )

    op.create_index(
        "ix_accounts_institution_id",
        "accounts",
        ["institution_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_accounts_institution_id",
        table_name="accounts",
    )

    op.drop_constraint(
        "uq_accounts_iban",
        "accounts",
        type_="unique",
    )

    op.drop_constraint(
        "uq_accounts_account_number",
        "accounts",
        type_="unique",
    )

    op.drop_constraint(
        "fk_accounts_institution_id",
        "accounts",
        type_="foreignkey",
    )

    op.drop_column("accounts", "iban")
    op.drop_column("accounts", "account_number")
    op.drop_column("accounts", "institution_id")

    op.drop_table("financial_institutions")