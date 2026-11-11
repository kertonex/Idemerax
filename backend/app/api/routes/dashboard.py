from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_completed_current_user
from app.application.transactions.recover_transaction import RecoverTransaction
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import get_session
from app.infrastructure.repositories.account import AccountRepository
from app.infrastructure.repositories.card import CardRepository
from app.infrastructure.repositories.transaction import TransactionRepository
from app.schemas.dashboard import (
    DashboardAccountSummary,
    DashboardMonthlyCashFlow,
    DashboardOverviewResponse,
    DashboardRecoverySummary,
    DashboardTransactionSummary,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _mask_iban(iban: str) -> str:
    normalized = "".join(iban.split()).upper()
    if len(normalized) <= 8:
        return normalized
    return f"{normalized[:2]}{'•' * max(4, len(normalized) - 6)}{normalized[-4:]}"


def _mask_email(email: str) -> str:
    local, separator, domain = email.partition("@")
    if not separator:
        return "Recipient hidden"
    visible = local[:1] if local else ""
    return f"{visible}•••@{domain}"


@router.get("/overview", response_model=DashboardOverviewResponse)
async def get_dashboard_overview(
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> DashboardOverviewResponse:
    """Return a compact dashboard overview for the authenticated user."""
    accounts = await AccountRepository(session).list_by_user_id(current_user.id)
    cards = await CardRepository(session).list_for_user(current_user.id)
    transaction_repository = TransactionRepository(session)
    transactions, _total_transactions = await transaction_repository.list_for_user(
        user_id=current_user.id,
        limit=5,
        offset=0,
    )
    recent_activity_count = await transaction_repository.count_for_user_since(
        user_id=current_user.id,
        since=datetime.now(UTC) - timedelta(days=7),
    )
    pending = await RecoverTransaction(session).get_pending(current_user.id)

    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if month_start.month == 12:
        next_month_start = month_start.replace(year=month_start.year + 1, month=1)
    else:
        next_month_start = month_start.replace(month=month_start.month + 1)
    (
        money_in,
        money_out,
        completed_month_count,
    ) = await transaction_repository.get_monthly_cash_flow(
        user_id=current_user.id,
        period_start=month_start,
        period_end=next_month_start,
    )

    account_summaries = [
        DashboardAccountSummary(
            id=account.id,
            account_number_suffix=account.account_number[-4:],
            masked_iban=_mask_iban(account.iban),
            balance=account.balance,
        )
        for account in accounts
    ]

    transaction_summaries: list[DashboardTransactionSummary] = []
    for transaction, direction in transactions:
        counterparty_account = (
            transaction.destination_account
            if direction == "outgoing"
            else transaction.source_account
        )
        counterparty_user = counterparty_account.user
        counterparty_name = " ".join(
            part.strip()
            for part in (counterparty_user.first_name, counterparty_user.last_name)
            if part and part.strip()
        ).strip()

        account_id_for_number = (
            transaction.source_account_id
            if direction == "outgoing"
            else transaction.destination_account_id
        )
        transaction_number = (
            await transaction_repository.get_account_transaction_number(
                account_id=account_id_for_number,
                created_at=transaction.created_at,
                transaction_id=transaction.id,
            )
        )

        transaction_summaries.append(
            DashboardTransactionSummary(
                id=transaction.id,
                transaction_number=transaction_number,
                created_at=transaction.created_at,
                amount=transaction.amount,
                reference=transaction.reference,
                transaction_type=transaction.transaction_type,
                status=transaction.status,
                transfer_method=(
                    transaction.transfer_method
                    if transaction.transfer_method in ("iban", "email")
                    else None
                ),
                direction=direction,
                counterparty_name=counterparty_name or None,
                counterparty_email=counterparty_user.email,
                counterparty_iban=counterparty_account.iban,
            )
        )

    recovery_summary = None
    if pending is not None:
        operation, destination_account = pending
        if operation.transfer_method == "iban":
            recipient_hint = _mask_iban(destination_account.iban)
        else:
            recipient_hint = _mask_email(destination_account.user.email)

        recovery_summary = DashboardRecoverySummary(
            status="PROCESSING",
            created_at=operation.created_at,
            amount=operation.amount,
            reference=operation.reference,
            recipient_hint=recipient_hint,
        )

    return DashboardOverviewResponse(
        total_balance=sum(
            (account.balance for account in accounts),
            start=Decimal("0.0000"),
        ),
        account_count=len(accounts),
        active_card_count=sum(card.status == "ACTIVE" for card in cards),
        recent_activity_count=recent_activity_count,
        accounts=account_summaries,
        recent_transactions=transaction_summaries,
        pending_recovery=recovery_summary,
        monthly_cash_flow=DashboardMonthlyCashFlow(
            period_start=month_start,
            period_end=next_month_start,
            money_in=money_in,
            money_out=money_out,
            net_movement=money_in - money_out,
            completed_transaction_count=completed_month_count,
        ),
    )
