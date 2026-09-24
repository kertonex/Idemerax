from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.application.authentication.register_user import (
    RegisterUser,
    RegistrationError,
)
from app.infrastructure.database.models.user import User


@pytest.mark.anyio
async def test_register_user_creates_user_and_account() -> None:
    """Register a new user and create their initial financial account."""
    user_repository = Mock()
    user_repository.get_by_email = AsyncMock(return_value=None)

    created_user = User(
        id=1,
        email="user@example.com",
        password_hash="hashed-password",
    )
    user_repository.create = AsyncMock(return_value=created_user)

    account_repository = Mock()
    account_repository.create = AsyncMock()

    register_user = RegisterUser(
        user_repository,
        account_repository,
    )

    with patch(
        "app.application.authentication.register_user.hash_password",
        return_value="hashed-password",
    ) as hash_password:
        result = await register_user.execute(
            email="user@example.com",
            password="TestPassword123!",
        )

    user_repository.get_by_email.assert_awaited_once_with(
        "user@example.com",
    )
    hash_password.assert_called_once_with("TestPassword123!")
    user_repository.create.assert_awaited_once_with(
        email="user@example.com",
        password_hash="hashed-password",
    )
    account_repository.create.assert_awaited_once_with(
        user_id=created_user.id,
    )

    assert result is created_user


@pytest.mark.anyio
async def test_register_user_rejects_existing_email() -> None:
    """Reject registration when the email address is already registered."""
    existing_user = User(
        id=1,
        email="user@example.com",
        password_hash="hashed-password",
    )

    user_repository = Mock()
    user_repository.get_by_email = AsyncMock(
        return_value=existing_user,
    )
    user_repository.create = AsyncMock()

    account_repository = Mock()
    account_repository.create = AsyncMock()

    register_user = RegisterUser(
        user_repository,
        account_repository,
    )

    with pytest.raises(
        RegistrationError,
        match="Email address is already registered.",
    ):
        await register_user.execute(
            email="user@example.com",
            password="TestPassword123!",
        )

    user_repository.create.assert_not_awaited()
    account_repository.create.assert_not_awaited()


@pytest.mark.anyio
async def test_register_user_hashes_password_before_creating_user() -> None:
    """Hash the password before passing it to the user repository."""
    user_repository = Mock()
    user_repository.get_by_email = AsyncMock(return_value=None)
    user_repository.create = AsyncMock(
        return_value=User(
            id=1,
            email="user@example.com",
            password_hash="hashed-password",
        ),
    )

    account_repository = Mock()
    account_repository.create = AsyncMock()

    register_user = RegisterUser(
        user_repository,
        account_repository,
    )

    with patch(
        "app.application.authentication.register_user.hash_password",
        return_value="hashed-password",
    ) as hash_password:
        await register_user.execute(
            email="user@example.com",
            password="TestPassword123!",
        )

    hash_password.assert_called_once_with("TestPassword123!")
    user_repository.create.assert_awaited_once_with(
        email="user@example.com",
        password_hash="hashed-password",
    )
    account_repository.create.assert_awaited_once_with(
        user_id=1,
    )
