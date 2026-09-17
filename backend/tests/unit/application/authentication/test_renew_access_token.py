from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.application.authentication.renew_access_token import (
    RefreshSessionError,
    RenewAccessToken,
)
from app.infrastructure.database.models.refresh_session import RefreshSession
from app.infrastructure.database.models.user import User


@pytest.fixture
def user() -> User:
    """Provide an active user for authentication tests."""
    return User(
        id=1,
        email="user@example.com",
        password_hash="hashed-password",
        is_active=True,
    )


@pytest.fixture
def refresh_session() -> RefreshSession:
    """Provide a valid refresh session for authentication tests."""
    return RefreshSession(
        id=1,
        user_id=1,
        token_hash="hashed-refresh-token",
        expires_at=datetime.now(UTC) + timedelta(days=30),
    )


@pytest.fixture
def refresh_session_repository() -> AsyncMock:
    """Provide a mock refresh session repository."""
    return AsyncMock()


@pytest.fixture
def user_repository() -> AsyncMock:
    """Provide a mock user repository."""
    return AsyncMock()


@pytest.fixture
def renew_access_token(
    refresh_session_repository: AsyncMock,
    user_repository: AsyncMock,
) -> RenewAccessToken:
    """Provide the access token renewal use case."""
    return RenewAccessToken(
        refresh_session_repository=refresh_session_repository,
        user_repository=user_repository,
    )


@pytest.mark.anyio
async def test_renew_access_token_returns_new_access_token(
    renew_access_token: RenewAccessToken,
    refresh_session_repository: AsyncMock,
    user_repository: AsyncMock,
    refresh_session: RefreshSession,
    user: User,
) -> None:
    """Verify that a valid refresh session produces a new access token."""
    refresh_session_repository.get_by_token_hash.return_value = refresh_session
    user_repository.get_by_id.return_value = user

    with patch(
        "app.application.authentication.renew_access_token.create_access_token",
        return_value="new-access-token",
    ):
        access_token = await renew_access_token.execute("refresh-token")

    assert access_token == "new-access-token"


@pytest.mark.anyio
async def test_renew_access_token_hashes_refresh_token(
    renew_access_token: RenewAccessToken,
    refresh_session_repository: AsyncMock,
    refresh_session: RefreshSession,
) -> None:
    """Verify that the refresh token is hashed before database lookup."""
    refresh_session_repository.get_by_token_hash.return_value = refresh_session

    with (
        patch(
            "app.application.authentication.renew_access_token.hash_refresh_token",
            return_value="hashed-refresh-token",
        ),
        patch(
            "app.application.authentication.renew_access_token.create_access_token",
            return_value="new-access-token",
        ),
    ):
        await renew_access_token.execute("refresh-token")

    refresh_session_repository.get_by_token_hash.assert_awaited_once_with(
        "hashed-refresh-token",
    )


@pytest.mark.anyio
async def test_renew_access_token_rejects_unknown_refresh_token(
    renew_access_token: RenewAccessToken,
    refresh_session_repository: AsyncMock,
) -> None:
    """Verify that an unknown refresh token is rejected."""
    refresh_session_repository.get_by_token_hash.return_value = None

    with pytest.raises(
        RefreshSessionError,
        match="Invalid refresh session.",
    ):
        await renew_access_token.execute("unknown-refresh-token")


@pytest.mark.anyio
async def test_renew_access_token_rejects_expired_session(
    renew_access_token: RenewAccessToken,
    refresh_session_repository: AsyncMock,
    refresh_session: RefreshSession,
) -> None:
    """Verify that an expired refresh session is rejected."""
    refresh_session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    refresh_session_repository.get_by_token_hash.return_value = refresh_session

    with pytest.raises(
        RefreshSessionError,
        match="Refresh session has expired.",
    ):
        await renew_access_token.execute("refresh-token")


@pytest.mark.anyio
async def test_renew_access_token_rejects_missing_user(
    renew_access_token: RenewAccessToken,
    refresh_session_repository: AsyncMock,
    user_repository: AsyncMock,
    refresh_session: RefreshSession,
) -> None:
    """Verify that a missing user is rejected."""
    refresh_session_repository.get_by_token_hash.return_value = refresh_session
    user_repository.get_by_id.return_value = None

    with pytest.raises(
        RefreshSessionError,
        match="Invalid refresh session.",
    ):
        await renew_access_token.execute("refresh-token")


@pytest.mark.anyio
async def test_renew_access_token_rejects_inactive_user(
    renew_access_token: RenewAccessToken,
    refresh_session_repository: AsyncMock,
    user_repository: AsyncMock,
    refresh_session: RefreshSession,
    user: User,
) -> None:
    """Verify that an inactive user is rejected."""
    user.is_active = False
    refresh_session_repository.get_by_token_hash.return_value = refresh_session
    user_repository.get_by_id.return_value = user

    with pytest.raises(
        RefreshSessionError,
        match="Invalid refresh session.",
    ):
        await renew_access_token.execute("refresh-token")
