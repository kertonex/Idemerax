from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class TransactionCreateRequest(BaseModel):
    """Represent a request to create a transaction."""

    destination_iban: str = Field(min_length=15, max_length=34)
    amount: Decimal = Field(gt=0, max_digits=19, decimal_places=4)
    reference: str | None = Field(default=None, max_length=140)

    @field_validator("reference", mode="before")
    @classmethod
    def normalize_reference(cls, value: object) -> object:
        """Normalize an empty or whitespace-only reference to None."""
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None

        return value


class IbanBankIdentificationResponse(BaseModel):
    """Represent Idemerax bank information resolved from an IBAN."""

    bank_code: str
    bank_name: str
    bic: str


class TransactionResponse(BaseModel):
    """Represent a transaction returned by the API."""

    id: int
    created_at: datetime
    source_account_id: int
    destination_account_id: int
    amount: Decimal
    transaction_type: str
    status: str
    reference: str | None = None
