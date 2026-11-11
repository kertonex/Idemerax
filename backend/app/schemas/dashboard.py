from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class DashboardAccountSummary(BaseModel):
    """Expose the account details needed by the dashboard."""

    id: int
    account_number_suffix: str
    masked_iban: str
    balance: Decimal


class DashboardTransactionSummary(BaseModel):
    """Expose a compact transaction item for the dashboard activity list."""

    id: int
    transaction_number: int
    created_at: datetime
    amount: Decimal
    reference: str | None
    transaction_type: str
    status: str
    transfer_method: Literal["iban", "email"] | None = None
    direction: Literal["incoming", "outgoing"]
    counterparty_name: str | None = None
    counterparty_email: str | None = None
    counterparty_iban: str | None = None


class DashboardRecoverySummary(BaseModel):
    """Expose only the information needed to resume a pending transfer."""

    status: Literal["PROCESSING"]
    created_at: datetime
    amount: Decimal
    reference: str | None
    recipient_hint: str


class DashboardMonthlyCashFlow(BaseModel):
    """Completed external money movements in the current calendar month."""

    period_start: datetime
    period_end: datetime
    money_in: Decimal
    money_out: Decimal
    net_movement: Decimal
    completed_transaction_count: int


class DashboardOverviewResponse(BaseModel):
    """Represent the authenticated user's aggregated dashboard overview."""

    currency: Literal["EUR"] = "EUR"
    total_balance: Decimal
    account_count: int
    active_card_count: int
    recent_activity_count: int
    accounts: list[DashboardAccountSummary]
    recent_transactions: list[DashboardTransactionSummary]
    pending_recovery: DashboardRecoverySummary | None
    monthly_cash_flow: DashboardMonthlyCashFlow
