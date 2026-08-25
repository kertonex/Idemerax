import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import SessionFactory


@pytest.mark.anyio
async def test_session_factory_creates_async_sessions() -> None:
    """Verify that the session factory creates async database sessions."""
    session = SessionFactory()

    try:
        assert isinstance(session, AsyncSession)
    finally:
        await session.close()
