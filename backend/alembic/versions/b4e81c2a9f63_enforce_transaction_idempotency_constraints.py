"""Enforce transaction idempotency metadata constraints.

Revision ID: b4e81c2a9f63
Revises: f18a6b2d9c41
Create Date: 2026-10-23
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b4e81c2a9f63"
down_revision: Union[str, Sequence[str], None] = "f18a6b2d9c41"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Enforce valid idempotency metadata while preserving historical rows.

    Transactions without idempotency metadata remain valid. When metadata is
    present, both the idempotency key and the SHA-256 fingerprint must be
    present and satisfy their respective format constraints.

    Existing invalid rows are reported before any constraints are created.
    """
    bind = op.get_bind()

    invalid_rows = bind.execute(
        sa.text(
            """
            SELECT COUNT(*)
            FROM transactions
            WHERE
                (idempotency_key IS NULL)
                    <> (request_fingerprint IS NULL)
                OR (
                    idempotency_key IS NOT NULL
                    AND length(idempotency_key) NOT BETWEEN 1 AND 128
                )
                OR (
                    idempotency_key IS NOT NULL
                    AND idempotency_key
                        !~ '^[A-Za-z0-9._:-]{1,128}$'
                )
                OR (
                    request_fingerprint IS NOT NULL
                    AND request_fingerprint !~ '^[0-9a-fA-F]{64}$'
                )
            """
        )
    ).scalar_one()

    if invalid_rows:
        raise RuntimeError(
            "Cannot enforce transaction idempotency constraints: "
            f"{invalid_rows} transaction row(s) contain invalid idempotency "
            "metadata. Repair these rows before rerunning the migration."
        )

    op.create_check_constraint(
        "ck_transactions_idempotency_metadata_pair",
        "transactions",
        """
        (idempotency_key IS NULL AND request_fingerprint IS NULL)
        OR
        (idempotency_key IS NOT NULL AND request_fingerprint IS NOT NULL)
        """,
    )

    op.create_check_constraint(
        "ck_transactions_idempotency_key_length",
        "transactions",
        """
        idempotency_key IS NULL
        OR length(idempotency_key) BETWEEN 1 AND 128
        """,
    )

    op.create_check_constraint(
        "ck_transactions_idempotency_key_format",
        "transactions",
        """
        idempotency_key IS NULL
        OR idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'
        """,
    )

    op.create_check_constraint(
        "ck_transactions_fingerprint_format",
        "transactions",
        """
        request_fingerprint IS NULL
        OR request_fingerprint ~ '^[0-9a-fA-F]{64}$'
        """,
    )


def downgrade() -> None:
    """Remove idempotency metadata constraints without deleting transaction data."""
    op.drop_constraint(
        "ck_transactions_fingerprint_format",
        "transactions",
        type_="check",
    )

    op.drop_constraint(
        "ck_transactions_idempotency_key_format",
        "transactions",
        type_="check",
    )

    op.drop_constraint(
        "ck_transactions_idempotency_key_length",
        "transactions",
        type_="check",
    )

    op.drop_constraint(
        "ck_transactions_idempotency_metadata_pair",
        "transactions",
        type_="check",
    )
