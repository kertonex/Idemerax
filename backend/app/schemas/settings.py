import unicodedata
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator, model_validator


class Language(StrEnum):
    """Represent a supported application language."""

    EN = "en"
    DE = "de"


class Theme(StrEnum):
    """Represent a supported application theme."""

    SYSTEM = "system"
    DARK = "dark"
    MIDNIGHT = "midnight"


class ProfileSettingsResponse(BaseModel):
    """Represent the user's profile settings."""

    first_name: str | None
    last_name: str | None
    email: str


class ProfileSettingsUpdate(BaseModel):
    """Represent the required profile information."""

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        """Normalize and validate a user's name."""
        normalized = " ".join(value.split())

        if not normalized:
            raise ValueError("Name must not be empty.")

        for character in normalized:
            category = unicodedata.category(character)

            if category.startswith("C"):
                raise ValueError("Name contains invalid control characters.")

            if character in {"-", "'", " "}:
                continue

            if not character.isalpha():
                raise ValueError(
                    "Name may contain only letters, spaces, hyphens, and apostrophes.",
                )

        return normalized


class PreferencesResponse(BaseModel):
    """Represent the user's application preferences."""

    language: Language
    theme: Theme


class PreferencesUpdate(BaseModel):
    """Represent application preference changes."""

    language: Language = Language.EN
    theme: Theme = Theme.SYSTEM


class NotificationSettingsResponse(BaseModel):
    """Represent the user's notification preferences."""

    notify_transaction_completed: bool
    notify_money_received: bool
    notify_transaction_failed: bool


class NotificationSettingsUpdate(BaseModel):
    """Represent notification preference changes."""

    notify_transaction_completed: bool = True
    notify_money_received: bool = True
    notify_transaction_failed: bool = True


class SettingsResponse(BaseModel):
    """Represent the complete settings returned by the API."""

    profile: ProfileSettingsResponse
    preferences: PreferencesResponse
    notifications: NotificationSettingsResponse


class PasswordChangeRequest(BaseModel):
    """Represent a request to change the user's password."""

    current_password: str = Field(min_length=15, max_length=128)
    new_password: str = Field(min_length=15, max_length=128)
    confirm_password: str = Field(min_length=15, max_length=128)

    @model_validator(mode="after")
    def validate_password_confirmation(self) -> "PasswordChangeRequest":
        """Ensure the new password and confirmation match."""
        if self.new_password != self.confirm_password:
            raise ValueError("New password and confirmation must match.")

        return self
