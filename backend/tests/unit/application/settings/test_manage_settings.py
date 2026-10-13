from unittest.mock import AsyncMock, patch

import pytest

from app.application.settings.manage_settings import (
    ManageSettings,
    PasswordChangeError,
    ProfileAlreadyCompletedError,
    SettingsError,
)
from app.infrastructure.database.models.user import User


def create_user(
    *,
    first_name: str | None = None,
    last_name: str | None = None,
    password_hash: str | None = "current-password-hash",
) -> User:
    """Create a user test double."""
    return User(
        id=1,
        email="user@example.com",
        password_hash=password_hash,
        first_name=first_name,
        last_name=last_name,
    )


@pytest.fixture
def settings_repository() -> AsyncMock:
    """Provide a mocked settings repository."""
    return AsyncMock()


@pytest.fixture
def refresh_session_repository() -> AsyncMock:
    """Provide a mocked refresh-session repository."""
    return AsyncMock()


@pytest.fixture
def manage_settings(
    settings_repository: AsyncMock,
    refresh_session_repository: AsyncMock,
) -> ManageSettings:
    """Provide the settings application service."""
    return ManageSettings(
        settings_repository=settings_repository,
        refresh_session_repository=refresh_session_repository,
    )


@pytest.mark.anyio
async def test_get_settings_returns_authenticated_user_settings(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
) -> None:
    """Return settings for the requested user."""
    user = create_user()
    settings_repository.get_by_user_id.return_value = user

    result = await manage_settings.get_settings(user_id=1)

    assert result is user
    settings_repository.get_by_user_id.assert_awaited_once_with(1)


@pytest.mark.anyio
async def test_get_settings_raises_when_user_not_found(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
) -> None:
    """Raise an error when the requested user does not exist."""
    settings_repository.get_by_user_id.return_value = None

    with pytest.raises(SettingsError, match="User not found."):
        await manage_settings.get_settings(user_id=1)


@pytest.mark.anyio
async def test_update_profile_completes_incomplete_profile(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
) -> None:
    """Complete a profile that has no required name information."""
    user = create_user()
    settings_repository.get_by_user_id.return_value = user
    settings_repository.update_profile.return_value = user

    result = await manage_settings.update_profile(
        user_id=1,
        first_name="Test",
        last_name="User",
    )

    assert result is user

    settings_repository.update_profile.assert_awaited_once_with(
        user_id=1,
        first_name="Test",
        last_name="User",
    )


@pytest.mark.anyio
async def test_update_profile_rejects_completed_profile(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
) -> None:
    """Prevent modifications after the required profile is completed."""
    user = create_user(
        first_name="Original",
        last_name="User",
    )
    settings_repository.get_by_user_id.return_value = user

    with pytest.raises(
        ProfileAlreadyCompletedError,
        match="Profile information cannot be changed after initial completion.",
    ):
        await manage_settings.update_profile(
            user_id=1,
            first_name="Changed",
            last_name="Name",
        )

    settings_repository.update_profile.assert_not_awaited()


@pytest.mark.anyio
async def test_update_profile_rejects_partially_initialized_profile(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
) -> None:
    """Prevent changes to profiles that already contain one required name."""
    user = create_user(first_name="Existing")
    settings_repository.get_by_user_id.return_value = user

    with pytest.raises(
        ProfileAlreadyCompletedError,
        match="Profile information cannot be changed after initial completion.",
    ):
        await manage_settings.update_profile(
            user_id=1,
            first_name="Changed",
            last_name="User",
        )

    settings_repository.update_profile.assert_not_awaited()


@pytest.mark.anyio
async def test_update_preferences_delegates_to_repository(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
) -> None:
    """Delegate preference updates to the settings repository."""
    user = create_user()
    settings_repository.update_preferences.return_value = user

    result = await manage_settings.update_preferences(
        user_id=1,
        language="de",
        theme="dark",
    )

    assert result is user

    settings_repository.update_preferences.assert_awaited_once_with(
        user_id=1,
        language="de",
        theme="dark",
    )


@pytest.mark.anyio
async def test_update_notifications_delegates_to_repository(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
) -> None:
    """Delegate notification updates to the settings repository."""
    user = create_user()
    settings_repository.update_notifications.return_value = user

    result = await manage_settings.update_notifications(
        user_id=1,
        notify_transaction_completed=False,
        notify_money_received=True,
        notify_transaction_failed=False,
    )

    assert result is user

    settings_repository.update_notifications.assert_awaited_once_with(
        user_id=1,
        notify_transaction_completed=False,
        notify_money_received=True,
        notify_transaction_failed=False,
    )


@pytest.mark.anyio
async def test_change_password_verifies_current_password(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
) -> None:
    """Verify the current password before changing it."""
    user = create_user()
    settings_repository.get_by_user_id.return_value = user
    settings_repository.update_password.return_value = user

    with (
        patch(
            "app.application.settings.manage_settings.verify_password",
            side_effect=[True, False],
        ) as verify_password,
        patch(
            "app.application.settings.manage_settings.hash_password",
            return_value="new-password-hash",
        ),
    ):
        await manage_settings.change_password(
            user_id=1,
            current_password="CurrentPassword123!",
            new_password="NewPassword123!",
        )

    verify_password.assert_any_call(
        "CurrentPassword123!",
        "current-password-hash",
    )

    settings_repository.update_password.assert_awaited_once_with(
        user_id=1,
        password_hash="new-password-hash",
    )


@pytest.mark.anyio
async def test_change_password_rejects_missing_current_password_hash(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
) -> None:
    """Reject password changes for users without a stored password hash."""
    user = create_user(password_hash=None)
    settings_repository.get_by_user_id.return_value = user

    with pytest.raises(
        PasswordChangeError,
        match="Current password is invalid.",
    ):
        await manage_settings.change_password(
            user_id=1,
            current_password="CurrentPassword123!",
            new_password="NewPassword123!",
        )

    settings_repository.update_password.assert_not_awaited()


@pytest.mark.anyio
async def test_change_password_rejects_invalid_current_password(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
    refresh_session_repository: AsyncMock,
) -> None:
    """Reject password changes when the current password is incorrect."""
    user = create_user()
    settings_repository.get_by_user_id.return_value = user

    with patch(
        "app.application.settings.manage_settings.verify_password",
        return_value=False,
    ):
        with pytest.raises(
            PasswordChangeError,
            match="Current password is invalid.",
        ):
            await manage_settings.change_password(
                user_id=1,
                current_password="WrongPassword123!",
                new_password="NewPassword123!",
            )

    settings_repository.update_password.assert_not_awaited()
    refresh_session_repository.delete_all_by_user_id.assert_not_awaited()


@pytest.mark.anyio
async def test_change_password_rejects_same_password(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
    refresh_session_repository: AsyncMock,
) -> None:
    """Reject replacing the password with the same password."""
    user = create_user()
    settings_repository.get_by_user_id.return_value = user

    with patch(
        "app.application.settings.manage_settings.verify_password",
        side_effect=[True, True],
    ):
        with pytest.raises(
            PasswordChangeError,
            match="New password must differ from the current password.",
        ):
            await manage_settings.change_password(
                user_id=1,
                current_password="CurrentPassword123!",
                new_password="CurrentPassword123!",
            )

    settings_repository.update_password.assert_not_awaited()
    refresh_session_repository.delete_all_by_user_id.assert_not_awaited()


@pytest.mark.anyio
async def test_change_password_hashes_new_password_and_invalidates_sessions(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
    refresh_session_repository: AsyncMock,
) -> None:
    """Hash the new password and invalidate all refresh sessions."""
    user = create_user()
    settings_repository.get_by_user_id.return_value = user
    settings_repository.update_password.return_value = user

    with (
        patch(
            "app.application.settings.manage_settings.verify_password",
            side_effect=[True, False],
        ),
        patch(
            "app.application.settings.manage_settings.hash_password",
            return_value="new-password-hash",
        ) as hash_password,
    ):
        result = await manage_settings.change_password(
            user_id=1,
            current_password="CurrentPassword123!",
            new_password="NewPassword123!",
        )

    assert result is user

    hash_password.assert_called_once_with("NewPassword123!")

    settings_repository.update_password.assert_awaited_once_with(
        user_id=1,
        password_hash="new-password-hash",
    )

    refresh_session_repository.delete_all_by_user_id.assert_awaited_once_with(
        user_id=1,
    )


@pytest.mark.anyio
async def test_change_password_does_not_update_password_when_verification_fails(
    manage_settings: ManageSettings,
    settings_repository: AsyncMock,
    refresh_session_repository: AsyncMock,
) -> None:
    """Do not update or invalidate sessions when verification fails."""
    user = create_user()
    settings_repository.get_by_user_id.return_value = user

    with patch(
        "app.application.settings.manage_settings.verify_password",
        return_value=False,
    ):
        with pytest.raises(PasswordChangeError):
            await manage_settings.change_password(
                user_id=1,
                current_password="WrongPassword123!",
                new_password="NewPassword123!",
            )

    settings_repository.update_password.assert_not_awaited()
    refresh_session_repository.delete_all_by_user_id.assert_not_awaited()
