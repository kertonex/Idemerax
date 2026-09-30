from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class TransactionCreateRequest(BaseModel):
    """Represent a request to create a transaction."""

    destination_iban: str = Field(min_length=15, max_length=34)
    amount: Decimal = Field(gt=0, max_digits=19, decimal_places=4)


class TransactionResponse(BaseModel):
    """Represent a transaction returned by the API."""

    id: int
    created_at: datetime
    source_account_id: int
    destination_account_id: int
    amount: Decimal
    transaction_type: str
    status: str
