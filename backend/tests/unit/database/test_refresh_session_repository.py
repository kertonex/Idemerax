from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy.dialects import postgresql

from app.infrastructure.repositories.refresh_session import RefreshSessionRepository


@pytest.mark.anyio
async def test_get_by_token_hash_for_update_uses_row_lock() -> None:
    """Lock the selected refresh session for the duration of rotation."""
    session = AsyncMock()
    result = Mock()
    result.scalar_one_or_none.return_value = None
    session.execute.return_value = result
    repository = RefreshSessionRepository(session)

    await repository.get_by_token_hash_for_update("token-hash")

    statement = session.execute.await_args.args[0]
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in compiled
    assert "token_hash" in compiled


@pytest.mark.anyio
async def test_delete_returns_true_when_one_session_is_removed() -> None:
    """Report successful consumption of the refresh session."""
    session = AsyncMock()
    result = Mock(rowcount=1)
    session.execute.return_value = result
    repository = RefreshSessionRepository(session)

    assert await repository.delete(12) is True


@pytest.mark.anyio
async def test_delete_returns_false_when_session_is_already_missing() -> None:
    """Report when a refresh session was already consumed or removed."""
    session = AsyncMock()
    result = Mock(rowcount=0)
    session.execute.return_value = result
    repository = RefreshSessionRepository(session)

    assert await repository.delete(12) is False
