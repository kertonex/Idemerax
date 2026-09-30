from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.application.transactions.process_transaction import (
    TransactionProcessing,
    TransactionProcessingError,
)
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import get_session
from app.infrastructure.repositories.account import AccountRepository
from app.infrastructure.repositories.transaction import TransactionRepository
from app.schemas.transaction import TransactionCreateRequest, TransactionResponse

router = APIRouter(prefix="/transactions", tags=["transactions"])


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
    transaction_processing = TransactionProcessing(
        account_repository=account_repository,
        transaction_repository=transaction_repository,
    )

    try:
        transaction = await transaction_processing.execute(
            user_id=current_user.id,
            destination_iban=transaction_data.destination_iban,
            amount=transaction_data.amount,
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
    )
