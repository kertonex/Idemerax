from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_completed_current_user
from app.application.accounts.create_account import CreateAccount
from app.application.accounts.get_my_account import GetMyAccount
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import get_session
from app.infrastructure.repositories.account import AccountRepository
from app.schemas.account import AccountResponse

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.post(
    "",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_account(
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> AccountResponse:
    """Create a financial account for the authenticated user."""
    account_repository = AccountRepository(session)
    create_account_use_case = CreateAccount(account_repository)

    account = await create_account_use_case.execute(
        user_id=current_user.id,
    )

    return AccountResponse(
        id=account.id,
        user_id=account.user_id,
        account_number=account.account_number,
        iban=account.iban,
        bic=account.institution.bic,
        created_at=account.created_at,
        balance=account.balance,
    )


@router.get(
    "",
    response_model=list[AccountResponse],
)
async def get_my_accounts(
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[AccountResponse]:
    """Return all financial accounts belonging to the authenticated user."""
    account_repository = AccountRepository(session)
    accounts = await account_repository.list_by_user_id(user_id=current_user.id)
    return [
        AccountResponse(
            id=account.id,
            user_id=account.user_id,
            account_number=account.account_number,
            iban=account.iban,
            bic=account.institution.bic,
            created_at=account.created_at,
            balance=account.balance,
        )
        for account in accounts
    ]


@router.get(
    "/me",
    response_model=AccountResponse,
)
async def get_my_account(
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> AccountResponse:
    """Return the financial account belonging to the authenticated user."""
    account_repository = AccountRepository(session)
    get_my_account_use_case = GetMyAccount(account_repository)

    account = await get_my_account_use_case.execute(
        user_id=current_user.id,
    )

    return AccountResponse(
        id=account.id,
        user_id=account.user_id,
        account_number=account.account_number,
        iban=account.iban,
        bic=account.institution.bic,
        created_at=account.created_at,
        balance=account.balance,
    )
