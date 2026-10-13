from app.application.authentication.ports import RefreshSessionRepositoryPort
from app.application.settings.ports import SettingsRepositoryPort
from app.core.security import hash_password, verify_password
from app.infrastructure.database.models.user import User


class SettingsError(Exception):
    """Raise when a settings operation fails."""


class ProfileAlreadyCompletedError(SettingsError):
    """Raise when an already completed profile is modified."""


class PasswordChangeError(SettingsError):
    """Raise when a password change fails."""


class ManageSettings:
    """Manage authenticated user settings."""

    def __init__(
        self,
        settings_repository: SettingsRepositoryPort,
        refresh_session_repository: RefreshSessionRepositoryPort,
    ) -> None:
        self.settings_repository = settings_repository
        self.refresh_session_repository = refresh_session_repository

    async def get_settings(self, user_id: int) -> User:
        """Return the authenticated user's settings."""
        user = await self.settings_repository.get_by_user_id(user_id)

        if user is None:
            raise SettingsError("User not found.")

        return user

    async def update_profile(
        self,
        user_id: int,
        first_name: str,
        last_name: str,
    ) -> User:
        """Complete the user's required profile information."""
        user = await self.get_settings(user_id)

        if user.profile_complete:
            raise ProfileAlreadyCompletedError(
                "Profile information cannot be changed after initial completion.",
            )

        if user.first_name is not None or user.last_name is not None:
            raise ProfileAlreadyCompletedError(
                "Profile information cannot be changed after initial completion.",
            )

        return await self.settings_repository.update_profile(
            user_id=user_id,
            first_name=first_name,
            last_name=last_name,
        )

    async def update_preferences(
        self,
        user_id: int,
        language: str,
        theme: str,
    ) -> User:
        """Update application preferences."""
        return await self.settings_repository.update_preferences(
            user_id=user_id,
            language=language,
            theme=theme,
        )

    async def update_notifications(
        self,
        user_id: int,
        notify_transaction_completed: bool,
        notify_money_received: bool,
        notify_transaction_failed: bool,
    ) -> User:
        """Update notification preferences."""
        return await self.settings_repository.update_notifications(
            user_id=user_id,
            notify_transaction_completed=notify_transaction_completed,
            notify_money_received=notify_money_received,
            notify_transaction_failed=notify_transaction_failed,
        )

    async def change_password(
        self,
        user_id: int,
        current_password: str,
        new_password: str,
    ) -> User:
        """Change the user's password and invalidate refresh sessions."""
        user = await self.get_settings(user_id)

        if user.password_hash is None:
            raise PasswordChangeError("Current password is invalid.")

        if not verify_password(current_password, user.password_hash):
            raise PasswordChangeError("Current password is invalid.")

        if verify_password(new_password, user.password_hash):
            raise PasswordChangeError(
                "New password must differ from the current password.",
            )

        password_hash = hash_password(new_password)

        user = await self.settings_repository.update_password(
            user_id=user_id,
            password_hash=password_hash,
        )

        await self.refresh_session_repository.delete_all_by_user_id(
            user_id=user_id,
        )

        return user
