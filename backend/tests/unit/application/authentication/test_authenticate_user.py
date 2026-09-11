from unittest.mock import AsyncMock, patch

import pytest

from app.application.authentication.authenticate_user import (
    AuthenticateUser,
    AuthenticationError,
)
from app.infrastructure.database.models.user import User


@pytest.fixture
def user_repository() -> AsyncMock:
    """Provide a mocked user repository."""
    return AsyncMock()


@pytest.fixture
def authenticate_user(user_repository: AsyncMock) -> AuthenticateUser:
    """Provide the authentication use case."""
    return AuthenticateUser(user_repository)


@pytest.mark.anyio
async def test_authenticate_user_returns_user_with_valid_credentials(
    authenticate_user: AuthenticateUser,
    user_repository: AsyncMock,
) -> None:
    user = User(
        email="user@example.com",
        password_hash="valid-password-hash",
        is_active=True,
    )
    user_repository.get_by_email.return_value = user

    with patch(
        "app.application.authentication.authenticate_user.verify_password",
        return_value=True,
    ) as verify_password:
        result = await authenticate_user.execute(
            email="user@example.com",
            password="correct-password",
        )

    assert result is user
    user_repository.get_by_email.assert_awaited_once_with(
        "user@example.com",
    )
    verify_password.assert_called_once_with(
        "correct-password",
        "valid-password-hash",
    )


@pytest.mark.anyio
async def test_authenticate_user_rejects_unknown_user(
    authenticate_user: AuthenticateUser,
    user_repository: AsyncMock,
) -> None:
    user_repository.get_by_email.return_value = None

    with patch(
        "app.application.authentication.authenticate_user.verify_password",
    ) as verify_password:
        with pytest.raises(
            AuthenticationError,
            match="Invalid credentials.",
        ):
            await authenticate_user.execute(
                email="unknown@example.com",
                password="password",
            )

    verify_password.assert_not_called()


@pytest.mark.anyio
async def test_authenticate_user_rejects_inactive_user(
    authenticate_user: AuthenticateUser,
    user_repository: AsyncMock,
) -> None:
    user = User(
        email="user@example.com",
        password_hash="valid-password-hash",
        is_active=False,
    )
    user_repository.get_by_email.return_value = user

    with patch(
        "app.application.authentication.authenticate_user.verify_password",
    ) as verify_password:
        with pytest.raises(
            AuthenticationError,
            match="Invalid credentials.",
        ):
            await authenticate_user.execute(
                email="user@example.com",
                password="password",
            )

    verify_password.assert_not_called()


@pytest.mark.anyio
async def test_authenticate_user_rejects_user_without_password_hash(
    authenticate_user: AuthenticateUser,
    user_repository: AsyncMock,
) -> None:
    user = User(
        email="user@example.com",
        password_hash=None,
        is_active=True,
    )
    user_repository.get_by_email.return_value = user

    with patch(
        "app.application.authentication.authenticate_user.verify_password",
    ) as verify_password:
        with pytest.raises(
            AuthenticationError,
            match="Invalid credentials.",
        ):
            await authenticate_user.execute(
                email="user@example.com",
                password="password",
            )

    verify_password.assert_not_called()


@pytest.mark.anyio
async def test_authenticate_user_rejects_invalid_password(
    authenticate_user: AuthenticateUser,
    user_repository: AsyncMock,
) -> None:
    user = User(
        email="user@example.com",
        password_hash="valid-password-hash",
        is_active=True,
    )
    user_repository.get_by_email.return_value = user

    with patch(
        "app.application.authentication.authenticate_user.verify_password",
        return_value=False,
    ) as verify_password:
        with pytest.raises(
            AuthenticationError,
            match="Invalid credentials.",
        ):
            await authenticate_user.execute(
                email="user@example.com",
                password="wrong-password",
            )

    verify_password.assert_called_once_with(
        "wrong-password",
        "valid-password-hash",
    )


@pytest.mark.anyio
async def test_authenticate_user_does_not_expose_authentication_reason(
    authenticate_user: AuthenticateUser,
    user_repository: AsyncMock,
) -> None:
    user = User(
        email="user@example.com",
        password_hash="valid-password-hash",
        is_active=True,
    )
    user_repository.get_by_email.return_value = user

    with patch(
        "app.application.authentication.authenticate_user.verify_password",
        return_value=False,
    ):
        with pytest.raises(AuthenticationError) as exc_info:
            await authenticate_user.execute(
                email="user@example.com",
                password="wrong-password",
            )

    assert str(exc_info.value) == "Invalid credentials."
