from app.application.authentication.ports import (
    RefreshSessionRepositoryPort,
)
from app.core.security import hash_refresh_token


class RefreshSessionRevocationError(Exception):
    """Raise when a refresh session cannot be revoked."""


class RevokeRefreshSession:
    """Revoke an existing refresh session."""

    def __init__(
        self,
        refresh_session_repository: RefreshSessionRepositoryPort,
    ) -> None:
        self.refresh_session_repository = refresh_session_repository

    async def execute(self, refresh_token: str) -> None:
        """Revoke the refresh session associated with a refresh token."""
        token_hash = hash_refresh_token(refresh_token)

        refresh_session = await self.refresh_session_repository.get_by_token_hash(
            token_hash,
        )

        if refresh_session is None:
            raise RefreshSessionRevocationError(
                "Invalid refresh session.",
            )

        await self.refresh_session_repository.delete(
            refresh_session.id,
        )
