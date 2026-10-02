from datetime import datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.transaction import TransactionCreateRequest, TransactionResponse


def test_transaction_create_request_accepts_valid_data() -> None:
    """Verify that a valid transaction request is accepted."""
    request = TransactionCreateRequest(
        destination_iban="DE89370400440532013000",
        amount=Decimal("100.00"),
    )

    assert request.destination_iban == "DE89370400440532013000"
    assert request.amount == Decimal("100.00")


def test_transaction_create_request_rejects_too_short_iban() -> None:
    """Verify that an IBAN below the minimum length is rejected."""
    with pytest.raises(ValidationError):
        TransactionCreateRequest(
            destination_iban="DE123",
            amount=Decimal("100.00"),
        )


def test_transaction_create_request_rejects_too_long_iban() -> None:
    """Verify that an IBAN above the maximum length is rejected."""
    with pytest.raises(ValidationError):
        TransactionCreateRequest(
            destination_iban="A" * 35,
            amount=Decimal("100.00"),
        )


def test_transaction_create_request_rejects_zero_amount() -> None:
    """Verify that a zero transaction amount is rejected."""
    with pytest.raises(ValidationError):
        TransactionCreateRequest(
            destination_iban="DE89370400440532013000",
            amount=Decimal("0"),
        )


def test_transaction_create_request_rejects_negative_amount() -> None:
    """Verify that a negative transaction amount is rejected."""
    with pytest.raises(ValidationError):
        TransactionCreateRequest(
            destination_iban="DE89370400440532013000",
            amount=Decimal("-100.00"),
        )


def test_transaction_create_request_rejects_excessive_decimal_places() -> None:
    """Verify that transaction amounts cannot exceed four decimal places."""
    with pytest.raises(ValidationError):
        TransactionCreateRequest(
            destination_iban="DE89370400440532013000",
            amount=Decimal("100.12345"),
        )


def test_transaction_create_request_accepts_four_decimal_places() -> None:
    """Verify that transaction amounts support four decimal places."""
    request = TransactionCreateRequest(
        destination_iban="DE89370400440532013000",
        amount=Decimal("100.1234"),
    )

    assert request.amount == Decimal("100.1234")


def test_transaction_response_accepts_valid_data() -> None:
    """Verify that a valid transaction response is accepted."""
    created_at = datetime.now(timezone.utc)

    response = TransactionResponse(
        id=1,
        created_at=created_at,
        source_account_id=1,
        destination_account_id=2,
        amount=Decimal("100.00"),
        transaction_type="TRANSFER",
        status="COMPLETED",
    )

    assert response.id == 1
    assert response.created_at == created_at
    assert response.source_account_id == 1
    assert response.destination_account_id == 2
    assert response.amount == Decimal("100.00")
    assert response.transaction_type == "TRANSFER"
    assert response.status == "COMPLETED"


def test_transaction_create_request_accepts_reference() -> None:
    """Verify that a transaction reference is accepted."""
    request = TransactionCreateRequest(
        destination_iban="DE89370400440532013000",
        amount=Decimal("100.00"),
        reference="Invoice 2026-001",
    )

    assert request.reference == "Invoice 2026-001"


def test_transaction_create_request_defaults_reference_to_none() -> None:
    """Verify that the transaction reference is optional."""
    request = TransactionCreateRequest(
        destination_iban="DE89370400440532013000",
        amount=Decimal("100.00"),
    )

    assert request.reference is None


@pytest.mark.parametrize("reference", ["", "   ", "\t\n"])
def test_transaction_create_request_normalizes_blank_reference(
    reference: str,
) -> None:
    """Verify that a blank transaction reference is normalized to None."""
    request = TransactionCreateRequest(
        destination_iban="DE89370400440532013000",
        amount=Decimal("100.00"),
        reference=reference,
    )

    assert request.reference is None


def test_transaction_create_request_strips_reference_whitespace() -> None:
    """Verify that surrounding reference whitespace is removed."""
    request = TransactionCreateRequest(
        destination_iban="DE89370400440532013000",
        amount=Decimal("100.00"),
        reference="  Invoice 2026-001  ",
    )

    assert request.reference == "Invoice 2026-001"


def test_transaction_create_request_accepts_140_character_reference() -> None:
    """Verify that a reference of exactly 140 characters is accepted."""
    reference = "R" * 140

    request = TransactionCreateRequest(
        destination_iban="DE89370400440532013000",
        amount=Decimal("100.00"),
        reference=reference,
    )

    assert request.reference == reference


def test_transaction_create_request_rejects_reference_over_140_characters() -> None:
    """Verify that references longer than 140 characters are rejected."""
    with pytest.raises(ValidationError):
        TransactionCreateRequest(
            destination_iban="DE89370400440532013000",
            amount=Decimal("100.00"),
            reference="R" * 141,
        )


def test_transaction_response_accepts_reference() -> None:
    """Verify that a transaction response includes its reference."""
    created_at = datetime.now(timezone.utc)

    response = TransactionResponse(
        id=1,
        created_at=created_at,
        source_account_id=1,
        destination_account_id=2,
        amount=Decimal("100.00"),
        transaction_type="TRANSFER",
        status="COMPLETED",
        reference="Invoice 2026-001",
    )

    assert response.reference == "Invoice 2026-001"
