from unittest.mock import AsyncMock, patch

import pytest

from app.application.authentication.revoke_refresh_session import (
    RefreshSessionRevocationError,
    RevokeRefreshSession,
)
from app.infrastructure.database.models.refresh_session import RefreshSession


@pytest.fixture
def refresh_session() -> RefreshSession:
    """Provide a refresh session."""
    return RefreshSession(
        id=1,
        user_id=1,
        token_hash="hashed-refresh-token",
    )


@pytest.fixture
def refresh_session_repository() -> AsyncMock:
    """Provide a mock refresh session repository."""
    return AsyncMock()


@pytest.fixture
def revoke_refresh_session_use_case(
    refresh_session_repository: AsyncMock,
) -> RevokeRefreshSession:
    """Provide the refresh session revocation use case."""
    return RevokeRefreshSession(
        refresh_session_repository=refresh_session_repository,
    )


@pytest.mark.anyio
async def test_revoke_refresh_session_deletes_session(
    revoke_refresh_session_use_case: RevokeRefreshSession,
    refresh_session_repository: AsyncMock,
    refresh_session: RefreshSession,
) -> None:
    """Verify that a valid refresh session is revoked."""
    refresh_session_repository.get_by_token_hash.return_value = refresh_session

    with patch(
        "app.application.authentication.revoke_refresh_session.hash_refresh_token",
        return_value="hashed-refresh-token",
    ):
        await revoke_refresh_session_use_case.execute(
            "refresh-token",
        )

    refresh_session_repository.delete.assert_awaited_once_with(
        refresh_session.id,
    )


@pytest.mark.anyio
async def test_revoke_refresh_session_hashes_refresh_token(
    revoke_refresh_session_use_case: RevokeRefreshSession,
    refresh_session_repository: AsyncMock,
    refresh_session: RefreshSession,
) -> None:
    """Verify that the refresh token is hashed before lookup."""
    refresh_session_repository.get_by_token_hash.return_value = refresh_session

    with patch(
        "app.application.authentication.revoke_refresh_session.hash_refresh_token",
        return_value="hashed-refresh-token",
    ) as hash_refresh_token:
        await revoke_refresh_session_use_case.execute(
            "refresh-token",
        )

    hash_refresh_token.assert_called_once_with("refresh-token")
    refresh_session_repository.get_by_token_hash.assert_awaited_once_with(
        "hashed-refresh-token",
    )


@pytest.mark.anyio
async def test_revoke_refresh_session_rejects_unknown_refresh_token(
    revoke_refresh_session_use_case: RevokeRefreshSession,
    refresh_session_repository: AsyncMock,
) -> None:
    """Verify that an unknown refresh token is rejected."""
    refresh_session_repository.get_by_token_hash.return_value = None

    with (
        patch(
            "app.application.authentication.revoke_refresh_session.hash_refresh_token",
            return_value="hashed-refresh-token",
        ),
        pytest.raises(
            RefreshSessionRevocationError,
            match="Invalid refresh session.",
        ),
    ):
        await revoke_refresh_session_use_case.execute(
            "unknown-refresh-token",
        )

    refresh_session_repository.delete.assert_not_awaited()


@pytest.mark.anyio
async def test_revoke_refresh_session_does_not_delete_different_session(
    revoke_refresh_session_use_case: RevokeRefreshSession,
    refresh_session_repository: AsyncMock,
    refresh_session: RefreshSession,
) -> None:
    """Verify that only the matched refresh session is revoked."""
    refresh_session.id = 42
    refresh_session_repository.get_by_token_hash.return_value = refresh_session

    with patch(
        "app.application.authentication.revoke_refresh_session.hash_refresh_token",
        return_value="hashed-refresh-token",
    ):
        await revoke_refresh_session_use_case.execute(
            "refresh-token",
        )

    refresh_session_repository.delete.assert_awaited_once_with(42)
