from dataclasses import dataclass

from app.domain.account.iban import is_valid_iban
from app.infrastructure.repositories.financial_institution import (
    FinancialInstitutionRepository,
)


class IbanBankIdentificationError(ValueError):
    """Raised when an IBAN cannot be identified."""


@dataclass(frozen=True)
class IbanBankIdentification:
    """Represent bank information resolved from an IBAN."""

    bank_code: str
    bank_name: str
    bic: str


async def identify_iban_bank(
    iban: str,
    financial_institution_repository: FinancialInstitutionRepository,
) -> IbanBankIdentification:
    """Identify Idemerax from a valid German IBAN."""
    normalized_iban = "".join(iban.split()).upper()

    if not is_valid_iban(normalized_iban):
        raise IbanBankIdentificationError(
            "The provided IBAN is invalid.",
        )

    bank_code = normalized_iban[4:12]

    financial_institution = await financial_institution_repository.get_by_bank_code(
        bank_code
    )

    if financial_institution is None:
        raise IbanBankIdentificationError(
            "The provided IBAN does not belong to Idemerax.",
        )

    return IbanBankIdentification(
        bank_code=financial_institution.bank_code,
        bank_name=financial_institution.name,
        bic=financial_institution.bic,
    )
