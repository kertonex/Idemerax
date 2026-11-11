from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repositories.transaction import TransactionRepository


@pytest.mark.anyio
async def test_monthly_cash_flow_returns_aggregated_external_completed_transfers() -> (
    None
):
    result = SimpleNamespace(
        one=lambda: (Decimal("1250.5000"), Decimal("320.0000"), 18),
    )
    session = SimpleNamespace(execute=AsyncMock(return_value=result))
    repository = TransactionRepository(cast(AsyncSession, session))

    money_in, money_out, count = await repository.get_monthly_cash_flow(
        user_id=42,
        period_start=datetime(2026, 11, 1, tzinfo=UTC),
        period_end=datetime(2026, 12, 1, tzinfo=UTC),
    )

    assert money_in == Decimal("1250.5000")
    assert money_out == Decimal("320.0000")
    assert count == 18
    session.execute.assert_awaited_once()
    statement = str(session.execute.await_args.args[0])
    assert "transactions.status" in statement
    assert "transactions.created_at" in statement
    assert "accounts_1.user_id" in statement


@pytest.mark.anyio
async def test_account_transaction_number_counts_chronological_account_activity() -> (
    None
):
    result = SimpleNamespace(scalar_one=lambda: 7)
    session = SimpleNamespace(execute=AsyncMock(return_value=result))
    repository = TransactionRepository(cast(AsyncSession, session))
    created_at = datetime(2026, 11, 10, 12, 30, tzinfo=UTC)

    number = await repository.get_account_transaction_number(
        account_id=12,
        created_at=created_at,
        transaction_id=88,
    )

    assert number == 7
    session.execute.assert_awaited_once()
    statement = str(session.execute.await_args.args[0])
    assert "transactions.source_account_id" in statement
    assert "transactions.destination_account_id" in statement
    assert "transactions.created_at" in statement
    assert "transactions.id" in statement


@pytest.mark.anyio
async def test_count_for_user_since_counts_incoming_and_outgoing_transactions() -> None:
    result = SimpleNamespace(scalar_one=lambda: 23)
    session = SimpleNamespace(execute=AsyncMock(return_value=result))
    repository = TransactionRepository(cast(AsyncSession, session))
    since = datetime(2026, 11, 3, tzinfo=UTC)

    count = await repository.count_for_user_since(user_id=42, since=since)

    assert count == 23
    session.execute.assert_awaited_once()
    statement = str(session.execute.await_args.args[0])
    assert "accounts_1.user_id" in statement
    assert "accounts_2.user_id" in statement
    assert "transactions.created_at" in statement
