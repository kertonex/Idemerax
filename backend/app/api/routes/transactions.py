from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_completed_current_user
from app.application.accounts.identify_iban_bank import (
    IbanBankIdentificationError,
    identify_iban_bank,
)
from app.application.transactions.process_transaction import (
    TransactionProcessing,
    TransactionProcessingError,
)
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import get_session
from app.infrastructure.repositories.account import AccountRepository
from app.infrastructure.repositories.financial_institution import (
    FinancialInstitutionRepository,
)
from app.infrastructure.repositories.transaction import TransactionRepository
from app.infrastructure.repositories.user import UserRepository
from app.schemas.transaction import (
    IbanBankIdentificationResponse,
    TransactionCreateRequest,
    TransactionHistoryItem,
    TransactionHistoryResponse,
    TransactionResponse,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _get_transfer_method(
    value: str | None,
) -> Literal["iban", "email"] | None:
    """Return a supported transfer method or None for unknown values."""
    if value == "iban":
        return "iban"

    if value == "email":
        return "email"

    return None


@router.get(
    "/bank-details",
    response_model=IbanBankIdentificationResponse,
)
async def identify_iban_bank_details(
    iban: str,
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> IbanBankIdentificationResponse:
    """Return Idemerax bank information for a valid IBAN."""
    del current_user

    financial_institution_repository = FinancialInstitutionRepository(session)

    try:
        bank_information = await identify_iban_bank(
            iban,
            financial_institution_repository,
        )
    except IbanBankIdentificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return IbanBankIdentificationResponse(
        bank_code=bank_information.bank_code,
        bank_name=bank_information.bank_name,
        bic=bank_information.bic,
    )


@router.get(
    "",
    response_model=TransactionHistoryResponse,
)
async def get_transaction_history(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> TransactionHistoryResponse:
    """Return a paginated history for the authenticated user."""
    repository = TransactionRepository(session)

    transactions, total = await repository.list_for_user(
        user_id=current_user.id,
        limit=limit,
        offset=offset,
    )

    items: list[TransactionHistoryItem] = []

    for transaction, direction in transactions:
        counterparty_account = (
            transaction.destination_account
            if direction == "outgoing"
            else transaction.source_account
        )
        counterparty_user = counterparty_account.user

        full_name = " ".join(
            part
            for part in (
                counterparty_user.first_name,
                counterparty_user.last_name,
            )
            if part and part.strip()
        ).strip()

        items.append(
            TransactionHistoryItem(
                id=transaction.id,
                created_at=transaction.created_at,
                source_account_id=transaction.source_account_id,
                destination_account_id=transaction.destination_account_id,
                amount=transaction.amount,
                transaction_type=transaction.transaction_type,
                status=transaction.status,
                reference=transaction.reference,
                transfer_method=_get_transfer_method(transaction.transfer_method),
                direction=direction,
                counterparty_name=full_name or None,
                counterparty_email=counterparty_user.email,
                counterparty_iban=counterparty_account.iban,
            )
        )

    return TransactionHistoryResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_transaction(
    transaction_data: TransactionCreateRequest,
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> TransactionResponse:
    """Create a transaction for the authenticated user."""
    account_repository = AccountRepository(session)
    transaction_repository = TransactionRepository(session)
    user_repository = UserRepository(session)

    transaction_processing = TransactionProcessing(
        account_repository=account_repository,
        transaction_repository=transaction_repository,
        user_repository=user_repository,
    )

    try:
        transaction = await transaction_processing.execute(
            user_id=current_user.id,
            destination_iban=transaction_data.destination_iban,
            destination_email=transaction_data.destination_email,
            amount=transaction_data.amount,
            reference=transaction_data.reference,
        )
    except TransactionProcessingError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return TransactionResponse(
        id=transaction.id,
        created_at=transaction.created_at,
        source_account_id=transaction.source_account_id,
        destination_account_id=transaction.destination_account_id,
        amount=transaction.amount,
        transaction_type=transaction.transaction_type,
        status=transaction.status,
        reference=transaction.reference,
        transfer_method=_get_transfer_method(transaction.transfer_method),
    )
