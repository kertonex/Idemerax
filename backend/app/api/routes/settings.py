from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.application.settings.manage_settings import (
    ManageSettings,
    PasswordChangeError,
    ProfileAlreadyCompletedError,
    SettingsError,
)
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import get_session
from app.infrastructure.repositories.refresh_session import RefreshSessionRepository
from app.infrastructure.repositories.settings import SettingsRepository
from app.schemas.settings import (
    Language,
    NotificationSettingsResponse,
    NotificationSettingsUpdate,
    PasswordChangeRequest,
    PreferencesResponse,
    PreferencesUpdate,
    ProfileSettingsResponse,
    ProfileSettingsUpdate,
    SettingsResponse,
    Theme,
)

router = APIRouter(prefix="/settings", tags=["settings"])


def build_manage_settings(session: AsyncSession) -> ManageSettings:
    """Build the settings application service."""
    return ManageSettings(
        settings_repository=SettingsRepository(session),
        refresh_session_repository=RefreshSessionRepository(session),
    )


def build_settings_response(user: User) -> SettingsResponse:
    """Build the public settings response."""
    return SettingsResponse(
        profile=ProfileSettingsResponse(
            first_name=user.first_name,
            last_name=user.last_name,
            email=user.email,
        ),
        preferences=PreferencesResponse(
            language=Language(user.language),
            theme=Theme(user.theme),
        ),
        notifications=NotificationSettingsResponse(
            notify_transaction_completed=user.notify_transaction_completed,
            notify_money_received=user.notify_money_received,
            notify_transaction_failed=user.notify_transaction_failed,
        ),
    )


@router.get("", response_model=SettingsResponse)
async def get_settings(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SettingsResponse:
    """Return settings belonging to the authenticated user."""
    manage_settings = build_manage_settings(session)

    try:
        user = await manage_settings.get_settings(current_user.id)
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return build_settings_response(user)


@router.put("/profile", response_model=ProfileSettingsResponse)
async def update_profile(
    profile_data: ProfileSettingsUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProfileSettingsResponse:
    """Set the authenticated user's required profile information."""
    manage_settings = build_manage_settings(session)

    try:
        user = await manage_settings.update_profile(
            user_id=current_user.id,
            first_name=profile_data.first_name,
            last_name=profile_data.last_name,
        )
    except ProfileAlreadyCompletedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return ProfileSettingsResponse(
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
    )


@router.put("/preferences", response_model=PreferencesResponse)
async def update_preferences(
    preferences_data: PreferencesUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PreferencesResponse:
    """Update the authenticated user's application preferences."""
    manage_settings = build_manage_settings(session)

    try:
        user = await manage_settings.update_preferences(
            user_id=current_user.id,
            language=preferences_data.language.value,
            theme=preferences_data.theme.value,
        )
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return PreferencesResponse(
        language=Language(user.language),
        theme=Theme(user.theme),
    )


@router.put(
    "/notifications",
    response_model=NotificationSettingsResponse,
)
async def update_notifications(
    notification_data: NotificationSettingsUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> NotificationSettingsResponse:
    """Update the authenticated user's notification preferences."""
    manage_settings = build_manage_settings(session)

    try:
        user = await manage_settings.update_notifications(
            user_id=current_user.id,
            notify_transaction_completed=(
                notification_data.notify_transaction_completed
            ),
            notify_money_received=notification_data.notify_money_received,
            notify_transaction_failed=notification_data.notify_transaction_failed,
        )
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return NotificationSettingsResponse(
        notify_transaction_completed=user.notify_transaction_completed,
        notify_money_received=user.notify_money_received,
        notify_transaction_failed=user.notify_transaction_failed,
    )


@router.post(
    "/password",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def change_password(
    password_data: PasswordChangeRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Change the authenticated user's password."""
    manage_settings = build_manage_settings(session)

    try:
        await manage_settings.change_password(
            user_id=current_user.id,
            current_password=password_data.current_password,
            new_password=password_data.new_password,
        )
    except PasswordChangeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    response.delete_cookie(
        key="__Host-refresh_token",
        path="/",
    )
