from sqlalchemy import select
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
