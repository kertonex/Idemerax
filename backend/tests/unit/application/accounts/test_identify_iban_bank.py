from unittest.mock import AsyncMock

import pytest

from app.application.accounts.identify_iban_bank import (
    IbanBankIdentificationError,
    identify_iban_bank,
)
from app.infrastructure.database.models.financial_institution import (
    FinancialInstitution,
)
from app.infrastructure.repositories.financial_institution import (
    FinancialInstitutionRepository,
)


@pytest.mark.anyio
async def test_identify_iban_bank_returns_idemerax_bank_information() -> None:
    repository = AsyncMock(spec=FinancialInstitutionRepository)
    repository.get_by_bank_code.return_value = FinancialInstitution(
        id=1,
        name="Idemerax",
        bank_code="12345678",
        bic="IDEMDEFFXXX",
    )

    result = await identify_iban_bank(
        "DE87123456781234567890",
        repository,
    )

    assert result.bank_code == "12345678"
    assert result.bank_name == "Idemerax"
    assert result.bic == "IDEMDEFFXXX"

    repository.get_by_bank_code.assert_awaited_once_with("12345678")


@pytest.mark.anyio
async def test_identify_iban_bank_normalizes_iban() -> None:
    repository = AsyncMock(spec=FinancialInstitutionRepository)
    repository.get_by_bank_code.return_value = FinancialInstitution(
        id=1,
        name="Idemerax",
        bank_code="12345678",
        bic="IDEMDEFFXXX",
    )

    result = await identify_iban_bank(
        "de87 1234 5678 1234 5678 90",
        repository,
    )

    assert result.bank_code == "12345678"
    assert result.bank_name == "Idemerax"
    assert result.bic == "IDEMDEFFXXX"

    repository.get_by_bank_code.assert_awaited_once_with("12345678")


@pytest.mark.anyio
async def test_identify_iban_bank_rejects_invalid_iban() -> None:
    repository = AsyncMock(spec=FinancialInstitutionRepository)

    with pytest.raises(
        IbanBankIdentificationError,
        match="The provided IBAN is invalid.",
    ):
        await identify_iban_bank(
            "DE00123456781234567890",
            repository,
        )

    repository.get_by_bank_code.assert_not_awaited()


@pytest.mark.anyio
async def test_identify_iban_bank_rejects_unknown_bank_code() -> None:
    repository = AsyncMock(spec=FinancialInstitutionRepository)
    repository.get_by_bank_code.return_value = None

    with pytest.raises(
        IbanBankIdentificationError,
        match="The provided IBAN does not belong to Idemerax.",
    ):
        await identify_iban_bank(
            "DE87123456781234567890",
            repository,
        )

    repository.get_by_bank_code.assert_awaited_once_with("12345678")
