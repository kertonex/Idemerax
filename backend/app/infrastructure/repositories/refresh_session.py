from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models.refresh_session import RefreshSession


class RefreshSessionRepository:
    """Provide database access for refresh sessions."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_token_hash(
        self,
        token_hash: str,
    ) -> RefreshSession | None:
        """Return a refresh session by token hash."""
        result = await self.session.execute(
            select(RefreshSession).where(
                RefreshSession.token_hash == token_hash,
            ),
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        user_id: int,
        token_hash: str,
        expires_at: datetime,
    ) -> RefreshSession:
        """Create and return a new refresh session."""
        refresh_session = RefreshSession(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self.session.add(refresh_session)
        await self.session.flush()
        return refresh_session

    async def delete(self, refresh_session_id: int) -> None:
        """Delete a refresh session."""
        await self.session.execute(
            delete(RefreshSession).where(
                RefreshSession.id == refresh_session_id,
            ),
        )
