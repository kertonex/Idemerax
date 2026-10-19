from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CardCreateRequest(BaseModel):
    """Validate a request to create a virtual demo debit card."""

    model_config = ConfigDict(extra="forbid")

    account_id: int = Field(gt=0)


class CardStatusUpdateRequest(BaseModel):
    """Validate an activation or deactivation request (not closure)."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["ACTIVE", "INACTIVE"]


class CardAccountSummary(BaseModel):
    """Expose only the account details needed by the card interface."""

    id: int
    account_number: str
    iban: str
    bic: str
    balance: Decimal


class CardResponse(BaseModel):
    """Represent a virtual demo card without sensitive payment credentials."""

    id: int
    account_id: int
    card_type: Literal["VIRTUAL_DEBIT"]
    last_four: str = Field(pattern=r"^\d{4}$")
    status: Literal["ACTIVE", "INACTIVE", "CLOSED"]
    created_at: datetime
    closed_at: datetime | None = None
    account: CardAccountSummary
