from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
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
    TransactionResponse,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get(
    "/bank-details",
    response_model=IbanBankIdentificationResponse,
)
async def identify_iban_bank_details(
    iban: str,
    current_user: User = Depends(get_current_user),
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


@router.post(
    "",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_transaction(
    transaction_data: TransactionCreateRequest,
    current_user: User = Depends(get_current_user),
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
    )
