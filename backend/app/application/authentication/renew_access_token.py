from datetime import UTC, datetime, timedelta

from app.application.authentication.ports import (
    RefreshSessionRepositoryPort,
    UserRepositoryPort,
)
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
)


class RefreshSessionError(Exception):
    """Raise when a refresh session is invalid."""


class RenewAccessToken:
    """Renew an access token and rotate the refresh token."""

    def __init__(
        self,
        refresh_session_repository: RefreshSessionRepositoryPort,
        user_repository: UserRepositoryPort,
    ) -> None:
        self.refresh_session_repository = refresh_session_repository
        self.user_repository = user_repository

    async def execute(
        self,
        refresh_token: str,
    ) -> tuple[str, str]:
        """Return new access and refresh tokens for a valid session."""
        token_hash = hash_refresh_token(refresh_token)

        refresh_session = await self.refresh_session_repository.get_by_token_hash(
            token_hash,
        )

        if refresh_session is None:
            raise RefreshSessionError(
                "Invalid refresh session.",
            )

        if refresh_session.expires_at <= datetime.now(UTC):
            raise RefreshSessionError(
                "Refresh session has expired.",
            )

        user = await self.user_repository.get_by_id(
            refresh_session.user_id,
        )

        if user is None or not user.is_active:
            raise RefreshSessionError(
                "Invalid refresh session.",
            )

        new_refresh_token = create_refresh_token()
        new_refresh_token_hash = hash_refresh_token(
            new_refresh_token,
        )
        new_expires_at = datetime.now(UTC) + timedelta(
            days=settings.refresh_session_expire_days,
        )

        await self.refresh_session_repository.delete(
            refresh_session.id,
        )

        await self.refresh_session_repository.create(
            user_id=user.id,
            token_hash=new_refresh_token_hash,
            expires_at=new_expires_at,
        )

        new_access_token = create_access_token(str(user.id))

        return new_access_token, new_refresh_token
