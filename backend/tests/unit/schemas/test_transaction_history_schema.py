from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

import pytest
from pydantic import ValidationError

from app.schemas.transaction import (
    TransactionHistoryItem,
    TransactionHistoryResponse,
)


def create_history_item(
    direction: Literal["incoming", "outgoing"] = "outgoing",
) -> TransactionHistoryItem:
    """Build a valid transaction history item."""
    return TransactionHistoryItem(
        id=1,
        created_at=datetime.now(timezone.utc),
        source_account_id=10,
        destination_account_id=20,
        amount=Decimal("25.00"),
        transaction_type="TRANSFER",
        status="COMPLETED",
        reference="Invoice 2026-001",
        transfer_method="iban",
        direction=direction,
        counterparty_name="Test Recipient",
        counterparty_email="recipient@example.com",
        counterparty_iban="DE89370400440532013000",
    )


@pytest.mark.parametrize("direction", ["incoming", "outgoing"])
def test_transaction_history_item_accepts_valid_direction(
    direction: Literal["incoming", "outgoing"],
) -> None:
    """Accept both supported transaction directions."""
    item = create_history_item(direction)

    assert item.direction == direction
    assert item.amount == Decimal("25.00")
    assert item.reference == "Invoice 2026-001"


def test_transaction_history_item_rejects_invalid_direction() -> None:
    """Reject values outside supported direction literals."""
    with pytest.raises(ValidationError):
        TransactionHistoryItem(
            id=1,
            created_at=datetime.now(timezone.utc),
            source_account_id=10,
            destination_account_id=20,
            amount=Decimal("25.00"),
            transaction_type="TRANSFER",
            status="COMPLETED",
            reference="Invoice 2026-001",
            direction="sideways",  # type: ignore[arg-type]
        )


def test_transaction_history_item_accepts_counterparty_fields() -> None:
    """Expose transfer method and counterparty details."""
    item = create_history_item()

    assert item.transfer_method == "iban"
    assert item.counterparty_name == "Test Recipient"
    assert item.counterparty_email == "recipient@example.com"
    assert item.counterparty_iban == "DE89370400440532013000"


def test_transaction_history_item_accepts_missing_optional_fields() -> None:
    """Allow history items without reference or counterparty metadata."""
    item = TransactionHistoryItem(
        id=2,
        created_at=datetime.now(timezone.utc),
        source_account_id=10,
        destination_account_id=20,
        amount=Decimal("0.01"),
        transaction_type="TRANSFER",
        status="PENDING",
        reference=None,
        transfer_method=None,
        direction="incoming",
    )

    assert item.reference is None
    assert item.transfer_method is None
    assert item.counterparty_name is None
    assert item.counterparty_email is None
    assert item.counterparty_iban is None


def test_transaction_history_response_accepts_empty_history() -> None:
    """Allow an empty history with pagination metadata."""
    response = TransactionHistoryResponse(
        items=[],
        total=0,
        limit=20,
        offset=0,
    )

    assert response.items == []
    assert response.total == 0
    assert response.limit == 20
    assert response.offset == 0


def test_transaction_history_response_accepts_history_items() -> None:
    """Include transaction items and pagination metadata."""
    item = create_history_item("incoming")

    response = TransactionHistoryResponse(
        items=[item],
        total=5,
        limit=1,
        offset=2,
    )

    assert response.items == [item]
    assert response.items[0].direction == "incoming"
    assert response.total == 5
    assert response.limit == 1
    assert response.offset == 2
