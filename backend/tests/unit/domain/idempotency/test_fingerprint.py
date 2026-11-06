from decimal import Decimal

import pytest

from app.domain.idempotency.fingerprint import transaction_fingerprint


def test_fingerprint_normalizes_iban_amount_and_reference() -> None:
    first = transaction_fingerprint(
        destination_iban="de89 3704 0044 0532 0130 00",
        destination_email=None,
        amount=Decimal("100.00"),
        reference=" Invoice 1 ",
    )

    second = transaction_fingerprint(
        destination_iban="DE89370400440532013000",
        destination_email=None,
        amount=Decimal("100.0000"),
        reference="Invoice 1",
    )

    assert first == second


def test_fingerprint_changes_when_transaction_intent_changes() -> None:
    original = transaction_fingerprint(
        destination_iban="DE89370400440532013000",
        destination_email=None,
        amount=Decimal("100.00"),
        reference=None,
    )

    changed = transaction_fingerprint(
        destination_iban="DE89370400440532013000",
        destination_email=None,
        amount=Decimal("101.00"),
        reference=None,
    )

    assert original != changed


def test_fingerprint_normalizes_email_and_empty_reference() -> None:
    first = transaction_fingerprint(
        destination_iban=None,
        destination_email=" Recipient@Example.COM ",
        amount=Decimal("0.5000"),
        reference="   ",
    )

    second = transaction_fingerprint(
        destination_iban=None,
        destination_email="recipient@example.com",
        amount=Decimal("0.5"),
        reference=None,
    )

    assert first == second


def test_fingerprint_is_stable_when_both_destination_fields_are_none() -> None:
    """Destination validation belongs to transaction processing."""
    first = transaction_fingerprint(
        destination_iban=None,
        destination_email=None,
        amount=Decimal("10.00"),
        reference=None,
    )

    second = transaction_fingerprint(
        destination_iban=None,
        destination_email=None,
        amount=Decimal("10.0000"),
        reference=None,
    )

    assert first == second


@pytest.mark.parametrize(
    "amount",
    [
        100,
        Decimal("NaN"),
        Decimal("Infinity"),
    ],
)
def test_fingerprint_rejects_non_decimal_or_non_finite_amount(
    amount,
) -> None:
    with pytest.raises(
        ValueError,
        match="Transaction amount must be a finite Decimal.",
    ):
        transaction_fingerprint(
            destination_iban="DE89370400440532013000",
            destination_email=None,
            amount=amount,
            reference=None,
        )
