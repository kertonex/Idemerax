from decimal import Decimal

from pydantic import BaseModel


class AccountResponse(BaseModel):
    """Represent an account returned by the API."""

    id: int
    user_id: int
    account_number: str
    iban: str
    balance: Decimal
