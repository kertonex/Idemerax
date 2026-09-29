import secrets

GERMAN_COUNTRY_CODE = "DE"
GERMAN_COUNTRY_NUMERIC = "1314"
ACCOUNT_NUMBER_UPPER_BOUND = 10_000_000_000


def generate_account_number() -> str:
    """Generate a ten-digit account number candidate."""
    return f"{secrets.randbelow(ACCOUNT_NUMBER_UPPER_BOUND):010d}"


def generate_iban(
    bank_code: str,
    account_number: str,
) -> str:
    """Generate a German-format IBAN."""
    if not bank_code.isdigit() or len(bank_code) != 8:
        raise ValueError("Bank code must contain exactly 8 digits.")

    if not account_number.isdigit() or len(account_number) != 10:
        raise ValueError("Account number must contain exactly 10 digits.")

    bban = f"{bank_code}{account_number}"
    remainder = int(f"{bban}{GERMAN_COUNTRY_NUMERIC}00") % 97
    check_digits = 98 - remainder

    return f"{GERMAN_COUNTRY_CODE}{check_digits:02d}{bban}"
