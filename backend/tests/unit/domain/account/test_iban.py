import pytest

from app.domain.account.iban import generate_iban


def test_generate_iban_rejects_invalid_bank_code() -> None:
    """Reject a bank code that is not exactly eight digits."""
    with pytest.raises(
        ValueError,
        match="Bank code must contain exactly 8 digits.",
    ):
        generate_iban(
            bank_code="1234567",
            account_number="1234567890",
        )


def test_generate_iban_rejects_non_numeric_bank_code() -> None:
    """Reject a bank code containing non-digit characters."""
    with pytest.raises(
        ValueError,
        match="Bank code must contain exactly 8 digits.",
    ):
        generate_iban(
            bank_code="1234567A",
            account_number="1234567890",
        )


def test_generate_iban_rejects_invalid_account_number() -> None:
    """Reject an account number that is not exactly ten digits."""
    with pytest.raises(
        ValueError,
        match="Account number must contain exactly 10 digits.",
    ):
        generate_iban(
            bank_code="12345678",
            account_number="123456789",
        )


def test_generate_iban_rejects_non_numeric_account_number() -> None:
    """Reject an account number containing non-digit characters."""
    with pytest.raises(
        ValueError,
        match="Account number must contain exactly 10 digits.",
    ):
        generate_iban(
            bank_code="12345678",
            account_number="123456789A",
        )
