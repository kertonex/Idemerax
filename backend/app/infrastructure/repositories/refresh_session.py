from datetime import datetime
from typing import Any, cast

from sqlalchemy import delete, select, update
from sqlalchemy.engine import CursorResult
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
        """Return a refresh session by token hash without locking it."""
        result = await self.session.execute(
            select(RefreshSession).where(
                RefreshSession.token_hash == token_hash,
            ),
        )
        return result.scalar_one_or_none()

    async def get_by_token_hash_for_update(
        self,
        token_hash: str,
    ) -> RefreshSession | None:
        """Return and lock a refresh session until the transaction completes."""
        result = await self.session.execute(
            select(RefreshSession)
            .where(RefreshSession.token_hash == token_hash)
            .with_for_update(),
        )
        return result.scalar_one_or_none()

    async def touch_if_active(
        self,
        token_hash: str,
        now: datetime,
        inactivity_cutoff: datetime,
    ) -> bool:
        """Record activity only for a non-expired, non-idle session."""
        result = await self.session.execute(
            update(RefreshSession)
            .where(
                RefreshSession.token_hash == token_hash,
                RefreshSession.expires_at > now,
                RefreshSession.last_activity_at > inactivity_cutoff,
            )
            .values(last_activity_at=now)
            .returning(RefreshSession.id),
        )
        return result.scalar_one_or_none() is not None

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

    async def delete(self, refresh_session_id: int) -> bool:
        """Delete a refresh session and report whether one row was removed."""
        result = await self.session.execute(
            delete(RefreshSession).where(
                RefreshSession.id == refresh_session_id,
            ),
        )
        cursor_result = cast(CursorResult[Any], result)
        return cursor_result.rowcount == 1

    async def delete_all_by_user_id(self, user_id: int) -> None:
        """Delete all refresh sessions belonging to a user."""
        await self.session.execute(
            delete(RefreshSession).where(
                RefreshSession.user_id == user_id,
            ),
        )
