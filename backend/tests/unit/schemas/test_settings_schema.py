import pytest
from pydantic import ValidationError

from app.schemas.settings import (
    Language,
    NotificationSettingsUpdate,
    PasswordChangeRequest,
    PreferencesUpdate,
    ProfileSettingsUpdate,
    Theme,
)


def test_profile_settings_update_accepts_valid_names() -> None:
    """Accept valid first and last names."""
    settings = ProfileSettingsUpdate(
        first_name="Test",
        last_name="User",
    )

    assert settings.first_name == "Test"
    assert settings.last_name == "User"


def test_profile_settings_update_normalizes_whitespace() -> None:
    """Normalize surrounding and repeated whitespace."""
    settings = ProfileSettingsUpdate(
        first_name="  Anna   Maria  ",
        last_name="  Schmidt  ",
    )

    assert settings.first_name == "Anna Maria"
    assert settings.last_name == "Schmidt"


def test_profile_settings_update_accepts_hyphenated_names() -> None:
    """Accept names containing hyphens."""
    settings = ProfileSettingsUpdate(
        first_name="Jean-Luc",
        last_name="Schmidt-Meyer",
    )

    assert settings.first_name == "Jean-Luc"
    assert settings.last_name == "Schmidt-Meyer"


def test_profile_settings_update_accepts_apostrophes() -> None:
    """Accept names containing apostrophes."""
    settings = ProfileSettingsUpdate(
        first_name="Patrick",
        last_name="O'Connor",
    )

    assert settings.last_name == "O'Connor"


def test_profile_settings_update_accepts_unicode_letters() -> None:
    """Accept names containing Unicode letters."""
    settings = ProfileSettingsUpdate(
        first_name="Jürgen",
        last_name="Müller",
    )

    assert settings.first_name == "Jürgen"
    assert settings.last_name == "Müller"


@pytest.mark.parametrize(
    "first_name,last_name",
    [
        ("", "User"),
        ("   ", "User"),
        ("Test", ""),
        ("Test", "   "),
    ],
)
def test_profile_settings_update_rejects_empty_names(
    first_name: str,
    last_name: str,
) -> None:
    """Reject empty or whitespace-only names."""
    with pytest.raises(ValidationError):
        ProfileSettingsUpdate(
            first_name=first_name,
            last_name=last_name,
        )


@pytest.mark.parametrize(
    "first_name,last_name",
    [
        ("Test123", "User"),
        ("Test", "User123"),
        ("Test@", "User"),
        ("Test", "User!"),
        ("Test_", "User"),
    ],
)
def test_profile_settings_update_rejects_invalid_characters(
    first_name: str,
    last_name: str,
) -> None:
    """Reject unsupported characters in names."""
    with pytest.raises(ValidationError):
        ProfileSettingsUpdate(
            first_name=first_name,
            last_name=last_name,
        )


def test_profile_settings_update_rejects_control_characters() -> None:
    """Reject control characters in names."""
    with pytest.raises(ValidationError):
        ProfileSettingsUpdate(
            first_name="Test\u0000User",
            last_name="User",
        )


def test_profile_settings_update_rejects_first_name_over_maximum_length() -> None:
    """Reject first names longer than the supported maximum."""
    with pytest.raises(ValidationError):
        ProfileSettingsUpdate(
            first_name="A" * 101,
            last_name="User",
        )


def test_profile_settings_update_rejects_last_name_over_maximum_length() -> None:
    """Reject last names longer than the supported maximum."""
    with pytest.raises(ValidationError):
        ProfileSettingsUpdate(
            first_name="Test",
            last_name="A" * 101,
        )


def test_preferences_update_defaults_to_english_and_system_theme() -> None:
    """Use English and the system theme as defaults."""
    preferences = PreferencesUpdate()

    assert preferences.language == Language.EN
    assert preferences.theme == Theme.SYSTEM


def test_preferences_update_accepts_german_language() -> None:
    """Accept German as a supported language."""
    preferences = PreferencesUpdate(language=Language.DE)

    assert preferences.language == Language.DE


@pytest.mark.parametrize(
    "theme",
    [
        Theme.SYSTEM,
        Theme.DARK,
        Theme.MIDNIGHT,
    ],
)
def test_preferences_update_accepts_supported_themes(
    theme: Theme,
) -> None:
    """Accept every supported application theme."""
    preferences = PreferencesUpdate(theme=theme)

    assert preferences.theme == theme


def test_preferences_update_rejects_unsupported_language() -> None:
    """Reject unsupported languages."""
    with pytest.raises(ValidationError):
        PreferencesUpdate.model_validate({"language": "fr"})


def test_preferences_update_rejects_unsupported_theme() -> None:
    """Reject unsupported themes."""
    with pytest.raises(ValidationError):
        PreferencesUpdate.model_validate({"theme": "unknown"})


def test_notification_settings_update_defaults_to_enabled() -> None:
    """Enable all supported notifications by default."""
    notifications = NotificationSettingsUpdate()

    assert notifications.notify_transaction_completed is True
    assert notifications.notify_money_received is True
    assert notifications.notify_transaction_failed is True


def test_notification_settings_update_accepts_disabled_preferences() -> None:
    """Allow supported notification preferences to be disabled."""
    notifications = NotificationSettingsUpdate(
        notify_transaction_completed=False,
        notify_money_received=False,
        notify_transaction_failed=False,
    )

    assert notifications.notify_transaction_completed is False
    assert notifications.notify_money_received is False
    assert notifications.notify_transaction_failed is False


def test_password_change_request_accepts_matching_passwords() -> None:
    """Accept a password change when confirmation matches."""
    request = PasswordChangeRequest(
        current_password="CurrentPassword123!",
        new_password="NewPassword123!",
        confirm_password="NewPassword123!",
    )

    assert request.current_password == "CurrentPassword123!"
    assert request.new_password == "NewPassword123!"
    assert request.confirm_password == "NewPassword123!"


def test_password_change_request_rejects_mismatched_confirmation() -> None:
    """Reject password changes with mismatched confirmation."""
    with pytest.raises(
        ValidationError,
        match="New password and confirmation must match.",
    ):
        PasswordChangeRequest(
            current_password="CurrentPassword123!",
            new_password="NewPassword123!",
            confirm_password="DifferentPassword123!",
        )


@pytest.mark.parametrize(
    "field",
    [
        "current_password",
        "new_password",
        "confirm_password",
    ],
)
def test_password_change_request_rejects_password_shorter_than_15_characters(
    field: str,
) -> None:
    """Reject passwords shorter than the existing authentication minimum."""
    values = {
        "current_password": "CurrentPassword123!",
        "new_password": "NewPassword123!",
        "confirm_password": "NewPassword123!",
    }

    values[field] = "Short123!"

    if field == "current_password":
        values["new_password"] = "NewPassword123!"
        values["confirm_password"] = "NewPassword123!"

    with pytest.raises(ValidationError):
        PasswordChangeRequest(**values)


def test_password_change_request_rejects_password_longer_than_128_characters() -> None:
    """Reject passwords longer than the existing authentication maximum."""
    long_password = "A" * 129

    with pytest.raises(ValidationError):
        PasswordChangeRequest(
            current_password="CurrentPassword123!",
            new_password=long_password,
            confirm_password=long_password,
        )


def test_language_enum_contains_supported_languages() -> None:
    """Verify the supported application languages."""
    assert Language.EN.value == "en"
    assert Language.DE.value == "de"


def test_theme_enum_contains_supported_themes() -> None:
    """Verify the supported application themes."""
    assert Theme.SYSTEM.value == "system"
    assert Theme.DARK.value == "dark"
    assert Theme.MIDNIGHT.value == "midnight"
