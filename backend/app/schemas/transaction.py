from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class IbanBankIdentificationResponse(BaseModel):
    """Represent bank information identified from an IBAN."""

    bank_code: str
    bank_name: str
    bic: str


class TransactionCreateRequest(BaseModel):
    """Represent a request to create a transaction."""

    destination_iban: str | None = Field(
        default=None,
        min_length=15,
        max_length=34,
    )
    destination_email: EmailStr | None = Field(
        default=None,
        max_length=254,
    )
    amount: Decimal = Field(
        gt=0,
        max_digits=19,
        decimal_places=4,
    )
    reference: str | None = Field(
        default=None,
        max_length=140,
    )

    @model_validator(mode="after")
    def validate_destination(self) -> "TransactionCreateRequest":
        """Require exactly one transaction destination."""
        if (self.destination_iban is None) == (self.destination_email is None):
            raise ValueError(
                "Exactly one of destination_iban or destination_email "
                "must be provided.",
            )

        return self

    @field_validator("destination_email", mode="before")
    @classmethod
    def normalize_destination_email(cls, value: object) -> object:
        """Normalize destination email addresses before validation."""
        if isinstance(value, str):
            return value.strip().lower()

        return value

    @field_validator("reference", mode="before")
    @classmethod
    def normalize_reference(cls, value: object) -> object:
        """Normalize optional transaction references."""
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None

        return value


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
