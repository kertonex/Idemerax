import secrets

GERMAN_COUNTRY_CODE = "DE"
GERMAN_COUNTRY_NUMERIC = "1314"
GERMAN_IBAN_LENGTH = 22
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


def is_valid_iban(iban: str) -> bool:
    """Return whether an IBAN has a valid German format and checksum."""
    normalized_iban = "".join(iban.split()).upper()

    if len(normalized_iban) != GERMAN_IBAN_LENGTH:
        return False

    if not normalized_iban.startswith(GERMAN_COUNTRY_CODE):
        return False

    if not normalized_iban[2:].isdigit():
        return False

    rearranged_iban = (
        f"{normalized_iban[4:]}{GERMAN_COUNTRY_NUMERIC}{normalized_iban[2:4]}"
    )

    return int(rearranged_iban) % 97 == 1
