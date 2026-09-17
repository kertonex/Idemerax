from datetime import UTC, datetime

from app.application.authentication.ports import (
    RefreshSessionRepositoryPort,
    UserRepositoryPort,
)
from app.core.security import (
    create_access_token,
    hash_refresh_token,
)


class RefreshSessionError(Exception):
    """Raise when a refresh session is invalid."""


class RenewAccessToken:
    """Renew an access token using a valid refresh session."""

    def __init__(
        self,
        refresh_session_repository: RefreshSessionRepositoryPort,
        user_repository: UserRepositoryPort,
    ) -> None:
        self.refresh_session_repository = refresh_session_repository
        self.user_repository = user_repository

    async def execute(self, refresh_token: str) -> str:
        """Return a new access token for a valid refresh session."""
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

        return create_access_token(str(user.id))
