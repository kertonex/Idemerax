from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import dashboard as dashboard_routes
from app.infrastructure.database.models.user import User


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def make_transaction(
    *,
    transaction_id: int,
    direction: str,
    transfer_method: str,
    first_name: str | None,
    last_name: str | None,
) -> SimpleNamespace:
    counterparty_user = SimpleNamespace(
        first_name=first_name,
        last_name=last_name,
        email="recipient@example.com",
    )
    counterparty_account = SimpleNamespace(
        user=counterparty_user,
        iban="DE89370400440532013000",
    )
    return SimpleNamespace(
        id=transaction_id,
        created_at=datetime(2026, 11, 5, 12, 30, tzinfo=UTC),
        amount=Decimal("25.50"),
        reference=f"REF-{transaction_id}",
        transaction_type="TRANSFER",
        status="COMPLETED",
        transfer_method=transfer_method,
        source_account_id=10 + transaction_id,
        destination_account_id=20 + transaction_id,
        source_account=(
            SimpleNamespace(user=counterparty_user, iban="DE89370400440532013000")
            if direction == "incoming"
            else SimpleNamespace(
                user=SimpleNamespace(first_name="Own", last_name="User")
            )
        ),
        destination_account=(
            counterparty_account
            if direction == "outgoing"
            else SimpleNamespace(
                user=SimpleNamespace(first_name="Own", last_name="User"),
                iban="DE89370400440532013000",
            )
        ),
    )


@pytest.mark.parametrize(
    ("now", "pending_method", "pending_email", "expected_period_end"),
    [
        (
            datetime(2026, 11, 11, 9, 0, tzinfo=UTC),
            None,
            None,
            datetime(2026, 12, 1, tzinfo=UTC),
        ),
        (
            datetime(2026, 12, 11, 9, 0, tzinfo=UTC),
            "iban",
            None,
            datetime(2027, 1, 1, tzinfo=UTC),
        ),
        (
            datetime(2026, 11, 11, 9, 0, tzinfo=UTC),
            "email",
            "@example.com",
            datetime(2026, 12, 1, tzinfo=UTC),
        ),
        (
            datetime(2026, 11, 11, 9, 0, tzinfo=UTC),
            "other",
            "invalid-email",
            datetime(2026, 12, 1, tzinfo=UTC),
        ),
    ],
)
@pytest.mark.anyio
async def test_dashboard_overview_covers_all_summary_paths(
    monkeypatch: pytest.MonkeyPatch,
    now: datetime,
    pending_method: str | None,
    pending_email: str | None,
    expected_period_end: datetime,
) -> None:
    account = SimpleNamespace(
        id=1,
        account_number="1234567890123456",
        iban="de89 3704 0044 0532 0130 00",
        balance=Decimal("100.00"),
    )
    short_iban_account = SimpleNamespace(
        id=2,
        account_number="1234",
        iban="SHORT",
        balance=Decimal("50.00"),
    )
    cards = [
        SimpleNamespace(status="ACTIVE"),
        SimpleNamespace(status="BLOCKED"),
    ]
    transactions = [
        (
            make_transaction(
                transaction_id=1,
                direction="outgoing",
                transfer_method="iban",
                first_name="  Ada ",
                last_name=" Lovelace  ",
            ),
            "outgoing",
        ),
        (
            make_transaction(
                transaction_id=2,
                direction="incoming",
                transfer_method="email",
                first_name=" ",
                last_name=None,
            ),
            "incoming",
        ),
        (
            make_transaction(
                transaction_id=3,
                direction="outgoing",
                transfer_method="unknown",
                first_name=None,
                last_name=" ",
            ),
            "outgoing",
        ),
    ]

    account_repository = SimpleNamespace(
        list_by_user_id=AsyncMock(return_value=[account, short_iban_account])
    )
    card_repository = SimpleNamespace(list_for_user=AsyncMock(return_value=cards))
    transaction_repository = SimpleNamespace(
        list_for_user=AsyncMock(return_value=(transactions, 3)),
        count_for_user_since=AsyncMock(return_value=9),
        get_account_transaction_number=AsyncMock(side_effect=[4, 5, 6]),
        get_monthly_cash_flow=AsyncMock(
            return_value=(Decimal("80.00"), Decimal("30.00"), 7)
        ),
    )

    if pending_method is None:
        pending = None
    else:
        operation = SimpleNamespace(
            transfer_method=pending_method,
            created_at=now,
            amount=Decimal("12.00"),
            reference="PENDING-REF",
        )
        destination_account = SimpleNamespace(
            iban="DE89370400440532013000",
            user=SimpleNamespace(email=pending_email or "recipient@example.com"),
        )
        pending = (operation, destination_account)

    recovery_service = SimpleNamespace(get_pending=AsyncMock(return_value=pending))

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return now if tz is not None else now.replace(tzinfo=None)

    monkeypatch.setattr(dashboard_routes, "datetime", FrozenDateTime)
    monkeypatch.setattr(
        dashboard_routes,
        "AccountRepository",
        lambda _session: account_repository,
    )
    monkeypatch.setattr(
        dashboard_routes,
        "CardRepository",
        lambda _session: card_repository,
    )
    monkeypatch.setattr(
        dashboard_routes,
        "TransactionRepository",
        lambda _session: transaction_repository,
    )
    monkeypatch.setattr(
        dashboard_routes,
        "RecoverTransaction",
        lambda _session: recovery_service,
    )

    result = await dashboard_routes.get_dashboard_overview(
        current_user=cast(User, SimpleNamespace(id=77)),
        session=cast(AsyncSession, object()),
    )

    assert result.total_balance == Decimal("150.00")
    assert result.account_count == 2
    assert result.active_card_count == 1
    assert result.recent_activity_count == 9
    assert result.accounts[0].masked_iban.startswith("DE")
    assert result.accounts[1].masked_iban == "SHORT"
    assert result.monthly_cash_flow.period_end == expected_period_end
    assert result.monthly_cash_flow.net_movement == Decimal("50.00")
    assert result.monthly_cash_flow.completed_transaction_count == 7
    assert [item.transaction_number for item in result.recent_transactions] == [4, 5, 6]
    assert result.recent_transactions[0].counterparty_name == "Ada Lovelace"
    assert result.recent_transactions[0].transfer_method == "iban"
    assert result.recent_transactions[1].counterparty_name is None
    assert result.recent_transactions[1].transfer_method == "email"
    assert result.recent_transactions[2].counterparty_name is None
    assert result.recent_transactions[2].transfer_method is None

    if pending_method is None:
        assert result.pending_recovery is None
    elif pending_method == "iban":
        assert result.pending_recovery is not None
        assert result.pending_recovery.recipient_hint.startswith("DE")
    elif pending_method == "email":
        assert result.pending_recovery is not None
        assert result.pending_recovery.recipient_hint == "•••@example.com"
    else:
        assert result.pending_recovery is not None
        assert result.pending_recovery.recipient_hint == "Recipient hidden"

    account_repository.list_by_user_id.assert_awaited_once_with(77)
    card_repository.list_for_user.assert_awaited_once_with(77)
    transaction_repository.list_for_user.assert_awaited_once_with(
        user_id=77,
        limit=5,
        offset=0,
    )
    assert transaction_repository.get_account_transaction_number.await_count == 3


def test_mask_iban_normalizes_short_and_masks_long_values() -> None:
    assert dashboard_routes._mask_iban(" de89 ") == "DE89"
    assert dashboard_routes._mask_iban("DE1234567") == "DE••••4567"
    assert dashboard_routes._mask_iban("de89 3704 0044 0532 0130 00") == (
        "DE" + "•" * 16 + "3000"
    )


def test_mask_email_handles_missing_separator_and_empty_local_part() -> None:
    assert dashboard_routes._mask_email("not-an-email") == "Recipient hidden"
    assert dashboard_routes._mask_email("@example.com") == "•••@example.com"
    assert dashboard_routes._mask_email("ada@example.com") == "a•••@example.com"
