from decimal import Decimal
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models.transaction import Transaction
from app.infrastructure.repositories.transaction import (
    IdempotencyPersistenceConflictError,
    TransactionRepository,
)

CONSTRAINT_NAME = "uq_transactions_source_idempotency_key"


def make_repository_session() -> SimpleNamespace:
    """Build the session operations required by the repository."""
    return SimpleNamespace(
        add=Mock(),
        flush=AsyncMock(),
        execute=AsyncMock(),
    )


class FakeConstraintError(Exception):
    """Represent a database error with constraint diagnostics."""

    def __init__(
        self,
        constraint_name: str | None = None,
        diagnostic_constraint_name: str | None = None,
    ) -> None:
        super().__init__("Integrity constraint violation")

        self.constraint_name = constraint_name

        if diagnostic_constraint_name is not None:
            self.diag = SimpleNamespace(
                constraint_name=diagnostic_constraint_name,
            )


def make_integrity_error(
    original_error: Exception,
) -> IntegrityError:
    """Wrap a simulated driver error in SQLAlchemy's IntegrityError."""
    return IntegrityError(
        "INSERT INTO transactions",
        {},
        original_error,
    )


@pytest.mark.anyio
async def test_create_persists_idempotency_metadata_and_flushes_only() -> None:
    session = make_repository_session()
    repository = TransactionRepository(cast(AsyncSession, session))

    transaction = await repository.create(
        source_account_id=10,
        destination_account_id=20,
        amount=Decimal("12.50"),
        transaction_type="TRANSFER",
        status="COMPLETED",
        reference="Invoice 10",
        transfer_method="iban",
        idempotency_key="repo-idempotency-001",
        request_fingerprint="a" * 64,
    )

    assert isinstance(transaction, Transaction)
    assert transaction.source_account_id == 10
    assert transaction.destination_account_id == 20
    assert transaction.amount == Decimal("12.50")
    assert transaction.idempotency_key == "repo-idempotency-001"
    assert transaction.request_fingerprint == "a" * 64

    session.add.assert_called_once_with(transaction)
    session.flush.assert_awaited_once()


@pytest.mark.anyio
async def test_create_maps_idempotency_unique_violation_to_domain_error() -> None:
    original_error = FakeConstraintError(
        constraint_name=CONSTRAINT_NAME,
    )
    integrity_error = make_integrity_error(original_error)

    session = make_repository_session()
    session.flush.side_effect = integrity_error

    repository = TransactionRepository(cast(AsyncSession, session))

    with pytest.raises(
        IdempotencyPersistenceConflictError,
    ) as exc_info:
        await repository.create(
            source_account_id=10,
            destination_account_id=20,
            amount=Decimal("12.50"),
            transaction_type="TRANSFER",
            status="COMPLETED",
            idempotency_key="repo-idempotency-002",
            request_fingerprint="b" * 64,
        )

    assert exc_info.value.__cause__ is integrity_error
    session.flush.assert_awaited_once()


@pytest.mark.anyio
async def test_create_does_not_translate_unrelated_integrity_errors() -> None:
    original_error = FakeConstraintError(
        constraint_name="fk_transactions_destination_account_id",
    )
    integrity_error = make_integrity_error(original_error)

    session = make_repository_session()
    session.flush.side_effect = integrity_error

    repository = TransactionRepository(cast(AsyncSession, session))

    with pytest.raises(IntegrityError) as exc_info:
        await repository.create(
            source_account_id=10,
            destination_account_id=20,
            amount=Decimal("12.50"),
            transaction_type="TRANSFER",
            status="COMPLETED",
            idempotency_key="repo-idempotency-003",
            request_fingerprint="c" * 64,
        )

    assert exc_info.value is integrity_error


@pytest.mark.parametrize(
    ("original_error", "expected"),
    [
        (
            FakeConstraintError(
                constraint_name=CONSTRAINT_NAME,
            ),
            True,
        ),
        (
            FakeConstraintError(
                constraint_name="different_constraint",
                diagnostic_constraint_name=CONSTRAINT_NAME,
            ),
            True,
        ),
        (
            FakeConstraintError(
                constraint_name="different_constraint",
                diagnostic_constraint_name="another_constraint",
            ),
            False,
        ),
        (
            FakeConstraintError(),
            False,
        ),
    ],
)
def test_identifies_only_the_idempotency_unique_constraint(
    original_error: Exception,
    expected: bool,
) -> None:
    error = make_integrity_error(original_error)

    assert TransactionRepository._is_idempotency_constraint_violation(error) is expected


@pytest.mark.anyio
@pytest.mark.parametrize(
    "existing_transaction",
    [
        None,
        SimpleNamespace(id=123),
    ],
)
async def test_get_by_idempotency_key_returns_optional_match(
    existing_transaction,
) -> None:
    session = make_repository_session()

    result = Mock()
    result.scalar_one_or_none.return_value = existing_transaction
    session.execute.return_value = result

    repository = TransactionRepository(cast(AsyncSession, session))

    transaction = await repository.get_by_idempotency_key(
        source_account_id=10,
        idempotency_key="repo-idempotency-004",
    )

    assert transaction is existing_transaction
    session.execute.assert_awaited_once()
