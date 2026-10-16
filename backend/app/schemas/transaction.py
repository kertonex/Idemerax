from datetime import datetime
from decimal import Decimal
from typing import Literal

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
                "Exactly one of destination_iban or destination_email must be provided."
            )
        return self

    @field_validator("destination_email", mode="before")
    @classmethod
    def normalize_destination_email(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("reference", mode="before")
    @classmethod
    def normalize_reference(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
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
    transfer_method: Literal["iban", "email"] | None = None


class TransactionHistoryItem(TransactionResponse):
    """Represent a transaction and counterparty details in a user's history."""

    direction: Literal["incoming", "outgoing"]
    counterparty_name: str | None = None
    counterparty_email: EmailStr | None = None
    counterparty_iban: str | None = None


class TransactionHistoryResponse(BaseModel):
    """Represent a paginated transaction history."""

    items: list[TransactionHistoryItem]
    total: int
    limit: int
    offset: int
