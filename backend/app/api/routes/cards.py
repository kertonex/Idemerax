from typing import Literal, cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_completed_current_user
from app.application.cards.manage_cards import (
    CardManagementError,
    CardNotFoundError,
    FinancialAccountNotFoundError,
    ManageCards,
)
from app.infrastructure.database.models.card import Card
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import get_session
from app.infrastructure.repositories.account import AccountRepository
from app.infrastructure.repositories.card import CardRepository
from app.schemas.card import (
    CardAccountSummary,
    CardCreateRequest,
    CardResponse,
    CardStatusUpdateRequest,
)

CardResponseStatus = Literal["ACTIVE", "INACTIVE", "CLOSED"]

router = APIRouter(prefix="/cards", tags=["cards"])


def _validated_status(value: str) -> CardResponseStatus:
    """Validate the persisted status before constructing the public response."""
    if value not in ("ACTIVE", "INACTIVE", "CLOSED"):
        raise RuntimeError(f"Unexpected persisted card status: {value!r}")
    return cast(CardResponseStatus, value)


def _to_response(card: Card) -> CardResponse:
    """Convert a persisted card and its linked account into an API response."""
    account = card.account
    return CardResponse(
        id=card.id,
        account_id=card.account_id,
        card_type="VIRTUAL_DEBIT",
        last_four=card.last_four,
        status=_validated_status(card.status),
        created_at=card.created_at,
        closed_at=card.closed_at,
        account=CardAccountSummary(
            id=account.id,
            account_number=account.account_number,
            iban=account.iban,
            bic=account.institution.bic,
            balance=account.balance,
        ),
    )


def _get_service(session: AsyncSession) -> ManageCards:
    return ManageCards(
        card_repository=CardRepository(session),
        account_repository=AccountRepository(session),
    )


@router.get("", response_model=list[CardResponse])
async def get_cards(
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CardResponse]:
    """Return cards linked to accounts owned by the authenticated user."""
    cards = await _get_service(session).list_for_user(user_id=current_user.id)
    return [_to_response(card) for card in cards]


@router.post(
    "",
    response_model=CardResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_card(
    request: CardCreateRequest,
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> CardResponse:
    """Create a virtual demo debit card for the user's own account."""
    try:
        card = await _get_service(session).create(
            user_id=current_user.id,
            account_id=request.account_id,
        )
    except FinancialAccountNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except CardManagementError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return _to_response(card)


@router.patch("/{card_id}/status", response_model=CardResponse)
async def update_card_status(
    card_id: int,
    request: CardStatusUpdateRequest,
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> CardResponse:
    """Activate or deactivate a card owned by the authenticated user."""
    try:
        card = await _get_service(session).update_status(
            card_id=card_id,
            user_id=current_user.id,
            new_status=request.status,
        )
    except CardNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except CardManagementError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return _to_response(card)


@router.post("/{card_id}/close", response_model=CardResponse)
async def close_card(
    card_id: int,
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> CardResponse:
    """Permanently close a card without deleting its historical record."""
    try:
        card = await _get_service(session).close_card(
            card_id=card_id,
            user_id=current_user.id,
        )
    except CardNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except CardManagementError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return _to_response(card)
