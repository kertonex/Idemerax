"""Canonical request fingerprinting for transaction idempotency."""

import hashlib
import json
from decimal import Decimal


def normalize_transaction_iban(iban: str | None) -> str | None:
    """Normalize an IBAN by removing whitespace and using uppercase."""
    if iban is None:
        return None

    return "".join(iban.split()).upper()


def normalize_transaction_email(email: str | None) -> str | None:
    """Normalize an email address for consistent request comparison."""
    if email is None:
        return None

    return email.strip().lower()


def normalize_transaction_reference(
    reference: str | None,
) -> str | None:
    """Normalize an optional transaction reference."""
    if reference is None:
        return None

    return reference.strip() or None


def _normalize_amount(amount: Decimal) -> str:
    """Return a context-independent canonical representation of a Decimal.

    ``Decimal.normalize()`` applies the active decimal context and can round a
    value when the caller has configured a lower precision. Fingerprints must
    represent the exact validated amount, regardless of ambient decimal
    settings, so normalize the textual representation without arithmetic.
    """
    if not isinstance(amount, Decimal) or not amount.is_finite():
        raise ValueError("Transaction amount must be a finite Decimal.")

    canonical = format(amount, "f")
    if "." in canonical:
        canonical = canonical.rstrip("0").rstrip(".")

    # Avoid different representations for signed zero. Transaction validation
    # rejects non-positive amounts, but keeping this helper canonical is safer.
    if canonical in {"-0", ""}:
        return "0"

    return canonical


def transaction_fingerprint(
    *,
    destination_iban: str | None,
    destination_email: str | None,
    amount: Decimal,
    reference: str | None,
) -> str:
    """Return a stable SHA-256 fingerprint of normalized transfer intent."""
    payload = {
        "destination_iban": normalize_transaction_iban(destination_iban),
        "destination_email": normalize_transaction_email(destination_email),
        "amount": _normalize_amount(amount),
        "reference": normalize_transaction_reference(reference),
    }

    canonical_payload = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )

    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()
