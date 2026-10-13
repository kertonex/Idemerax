from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.application.settings.manage_settings import (
    ProfileAlreadyCompletedError,
    SettingsError,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.infrastructure.database.models.refresh_session import RefreshSession
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
from app.main import app

client = TestClient(app)


async def create_test_user(
    *,
    first_name: str | None = None,
    last_name: str | None = None,
    password: str = "CurrentPassword123!",
) -> tuple[int, str]:
    """Create a user for settings API tests."""
    email = f"settings-api-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password(password),
            first_name=first_name,
            last_name=last_name,
        )
        session.add(user)
        await session.commit()

        return user.id, email


@pytest.mark.anyio
async def test_get_settings_requires_authentication() -> None:
    """Reject settings retrieval without authentication."""
    response = client.get("/settings")

    assert response.status_code == 401


@pytest.mark.anyio
async def test_get_settings_returns_authenticated_users_settings() -> None:
    """Return settings belonging to the authenticated user."""
    user_id, email = await create_test_user(
        first_name="Test",
        last_name="User",
    )
    access_token = create_access_token(str(user_id))

    response = client.get(
        "/settings",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200

    assert response.json() == {
        "profile": {
            "first_name": "Test",
            "last_name": "User",
            "email": email,
        },
        "preferences": {
            "language": "en",
            "theme": "system",
        },
        "notifications": {
            "notify_transaction_completed": True,
            "notify_money_received": True,
            "notify_transaction_failed": True,
        },
    }


@pytest.mark.anyio
async def test_get_settings_returns_incomplete_profile() -> None:
    """Return incomplete profile information for a newly registered user."""
    user_id, email = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.get(
        "/settings",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["profile"] == {
        "first_name": None,
        "last_name": None,
        "email": email,
    }


@pytest.mark.anyio
async def test_get_settings_returns_not_found_when_service_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Return 404 when the settings service cannot find the user."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))
    manage_settings = AsyncMock()
    manage_settings.get_settings.side_effect = SettingsError("User not found.")

    monkeypatch.setattr(
        "app.api.routes.settings.build_manage_settings",
        lambda session: manage_settings,
    )

    response = client.get(
        "/settings",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "User not found.",
    }


@pytest.mark.anyio
async def test_update_profile_completes_required_profile() -> None:
    """Save the required first and last name for an incomplete profile."""
    user_id, email = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.put(
        "/settings/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "first_name": "Test",
            "last_name": "User",
        },
    )

    assert response.status_code == 200

    assert response.json() == {
        "first_name": "Test",
        "last_name": "User",
        "email": email,
    }

    async with SessionFactory() as session:
        user = await session.get(User, user_id)

    assert user is not None
    assert user.first_name == "Test"
    assert user.last_name == "User"
    assert user.email == email


@pytest.mark.anyio
async def test_update_profile_normalizes_whitespace() -> None:
    """Normalize repeated and surrounding whitespace in names."""
    user_id, email = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.put(
        "/settings/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "first_name": "  Anna   Maria  ",
            "last_name": "  Schmidt  ",
        },
    )

    assert response.status_code == 200

    assert response.json() == {
        "first_name": "Anna Maria",
        "last_name": "Schmidt",
        "email": email,
    }


@pytest.mark.anyio
async def test_update_profile_accepts_hyphens_and_apostrophes() -> None:
    """Allow common name characters such as hyphens and apostrophes."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.put(
        "/settings/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "first_name": "Jean-Luc",
            "last_name": "O'Connor",
        },
    )

    assert response.status_code == 200

    assert response.json()["first_name"] == "Jean-Luc"
    assert response.json()["last_name"] == "O'Connor"


@pytest.mark.anyio
async def test_update_profile_rejects_control_characters() -> None:
    """Reject names containing control characters."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.put(
        "/settings/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "first_name": "Test\u0000User",
            "last_name": "User",
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_update_profile_rejects_invalid_characters() -> None:
    """Reject names containing unsupported characters."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.put(
        "/settings/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "first_name": "Test123",
            "last_name": "User",
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_update_profile_rejects_completed_profile() -> None:
    """Prevent first-name and last-name changes after completion."""
    user_id, _ = await create_test_user(
        first_name="Original",
        last_name="User",
    )

    access_token = create_access_token(str(user_id))

    response = client.put(
        "/settings/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "first_name": "Changed",
            "last_name": "Name",
        },
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": ("Profile information cannot be changed after initial completion."),
    }

    async with SessionFactory() as session:
        user = await session.get(User, user_id)

    assert user is not None
    assert user.first_name == "Original"
    assert user.last_name == "User"


@pytest.mark.anyio
async def test_update_profile_returns_conflict_when_service_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Return 409 when the profile is already completed."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))
    manage_settings = AsyncMock()
    manage_settings.update_profile.side_effect = ProfileAlreadyCompletedError(
        "Profile information cannot be changed after initial completion.",
    )

    monkeypatch.setattr(
        "app.api.routes.settings.build_manage_settings",
        lambda session: manage_settings,
    )

    response = client.put(
        "/settings/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "first_name": "Test",
            "last_name": "User",
        },
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": ("Profile information cannot be changed after initial completion."),
    }


@pytest.mark.anyio
async def test_update_profile_returns_not_found_when_service_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Return 404 when the profile service cannot find the user."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))
    manage_settings = AsyncMock()
    manage_settings.update_profile.side_effect = SettingsError(
        "User not found.",
    )

    monkeypatch.setattr(
        "app.api.routes.settings.build_manage_settings",
        lambda session: manage_settings,
    )

    response = client.put(
        "/settings/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "first_name": "Test",
            "last_name": "User",
        },
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "User not found.",
    }


@pytest.mark.anyio
async def test_update_profile_does_not_allow_email_change() -> None:
    """Do not expose email as a writable profile field."""
    user_id, email = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.put(
        "/settings/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "first_name": "Test",
            "last_name": "User",
            "email": "changed@example.com",
        },
    )

    assert response.status_code == 200

    assert response.json()["email"] == email

    async with SessionFactory() as session:
        user = await session.get(User, user_id)

    assert user is not None
    assert user.email == email


@pytest.mark.anyio
async def test_update_preferences_changes_language_and_theme() -> None:
    """Persist supported language and theme preferences."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.put(
        "/settings/preferences",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "language": "de",
            "theme": "dark",
        },
    )

    assert response.status_code == 200

    assert response.json() == {
        "language": "de",
        "theme": "dark",
    }

    async with SessionFactory() as session:
        user = await session.get(User, user_id)

    assert user is not None
    assert user.language == "de"
    assert user.theme == "dark"


@pytest.mark.anyio
async def test_update_preferences_accepts_all_supported_themes() -> None:
    """Accept every supported application theme."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    for theme in ("system", "dark", "midnight"):
        response = client.put(
            "/settings/preferences",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "language": "en",
                "theme": theme,
            },
        )

        assert response.status_code == 200
        assert response.json()["theme"] == theme


@pytest.mark.anyio
async def test_update_preferences_rejects_unsupported_language() -> None:
    """Reject unsupported application languages."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.put(
        "/settings/preferences",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "language": "fr",
            "theme": "system",
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_update_preferences_rejects_unsupported_theme() -> None:
    """Reject unsupported application themes."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.put(
        "/settings/preferences",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "language": "en",
            "theme": "unknown",
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_update_preferences_returns_not_found_when_service_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Return 404 when preference retrieval fails."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))
    manage_settings = AsyncMock()
    manage_settings.update_preferences.side_effect = SettingsError(
        "User not found.",
    )

    monkeypatch.setattr(
        "app.api.routes.settings.build_manage_settings",
        lambda session: manage_settings,
    )

    response = client.put(
        "/settings/preferences",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "language": "de",
            "theme": "dark",
        },
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "User not found.",
    }


@pytest.mark.anyio
async def test_update_notifications_persists_preferences() -> None:
    """Persist supported notification preferences."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.put(
        "/settings/notifications",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "notify_transaction_completed": False,
            "notify_money_received": True,
            "notify_transaction_failed": False,
        },
    )

    assert response.status_code == 200

    assert response.json() == {
        "notify_transaction_completed": False,
        "notify_money_received": True,
        "notify_transaction_failed": False,
    }

    async with SessionFactory() as session:
        user = await session.get(User, user_id)

    assert user is not None
    assert user.notify_transaction_completed is False
    assert user.notify_money_received is True
    assert user.notify_transaction_failed is False


@pytest.mark.anyio
async def test_update_notifications_returns_not_found_when_service_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Return 404 when notification settings cannot be updated."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))
    manage_settings = AsyncMock()
    manage_settings.update_notifications.side_effect = SettingsError(
        "User not found.",
    )

    monkeypatch.setattr(
        "app.api.routes.settings.build_manage_settings",
        lambda session: manage_settings,
    )

    response = client.put(
        "/settings/notifications",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "notify_transaction_completed": True,
            "notify_money_received": True,
            "notify_transaction_failed": True,
        },
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "User not found.",
    }


@pytest.mark.anyio
async def test_change_password_requires_authentication() -> None:
    """Reject password changes without authentication."""
    response = client.post(
        "/settings/password",
        json={
            "current_password": "CurrentPassword123!",
            "new_password": "NewPassword123!",
            "confirm_password": "NewPassword123!",
        },
    )

    assert response.status_code == 401


@pytest.mark.anyio
async def test_change_password_changes_password() -> None:
    """Change the authenticated user's password."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.post(
        "/settings/password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": "CurrentPassword123!",
            "new_password": "NewPassword123!",
            "confirm_password": "NewPassword123!",
        },
    )

    assert response.status_code == 204

    async with SessionFactory() as session:
        user = await session.get(User, user_id)

    assert user is not None
    assert user.password_hash is not None

    assert verify_password(
        "NewPassword123!",
        user.password_hash,
    )

    assert not verify_password(
        "CurrentPassword123!",
        user.password_hash,
    )


@pytest.mark.anyio
async def test_change_password_rejects_wrong_current_password() -> None:
    """Reject password changes with an incorrect current password."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.post(
        "/settings/password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": "WrongPassword123!",
            "new_password": "NewPassword123!",
            "confirm_password": "NewPassword123!",
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Current password is invalid.",
    }


@pytest.mark.anyio
async def test_change_password_rejects_same_password() -> None:
    """Reject changing the password to the current password."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.post(
        "/settings/password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": "CurrentPassword123!",
            "new_password": "CurrentPassword123!",
            "confirm_password": "CurrentPassword123!",
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "New password must differ from the current password.",
    }


@pytest.mark.anyio
async def test_change_password_rejects_mismatched_confirmation() -> None:
    """Reject password changes when confirmation does not match."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.post(
        "/settings/password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": "CurrentPassword123!",
            "new_password": "NewPassword123!",
            "confirm_password": "DifferentPassword123!",
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_change_password_rejects_too_short_password() -> None:
    """Reject passwords that violate cthe existing authentication rules."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.post(
        "/settings/password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": "CurrentPassword123!",
            "new_password": "Short123!",
            "confirm_password": "Short123!",
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_change_password_invalidates_refresh_sessions() -> None:
    """Invalidate existing refresh sessions after a password change."""
    user_id, _ = await create_test_user()
    refresh_token = create_refresh_token()

    async with SessionFactory() as session:
        refresh_session = RefreshSession(
            user_id=user_id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        session.add(refresh_session)
        await session.commit()

        refresh_session_id = refresh_session.id

    access_token = create_access_token(str(user_id))

    response = client.post(
        "/settings/password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": "CurrentPassword123!",
            "new_password": "NewPassword123!",
            "confirm_password": "NewPassword123!",
        },
    )

    assert response.status_code == 204

    async with SessionFactory() as session:
        deleted_session = await session.get(
            RefreshSession,
            refresh_session_id,
        )

    assert deleted_session is None


@pytest.mark.anyio
async def test_change_password_clears_refresh_token_cookie() -> None:
    """Clear the refresh-token cookie after changing the password."""
    user_id, _ = await create_test_user()

    access_token = create_access_token(str(user_id))

    response = client.post(
        "/settings/password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": "CurrentPassword123!",
            "new_password": "NewPassword123!",
            "confirm_password": "NewPassword123!",
        },
    )

    assert response.status_code == 204
    assert "__Host-refresh_token" in response.headers.get("set-cookie", "")


@pytest.mark.anyio
async def test_settings_are_isolated_between_users() -> None:
    """Ensure one authenticated user cannot modify another user's settings."""
    first_user_id, first_email = await create_test_user()
    second_user_id, second_email = await create_test_user()

    first_access_token = create_access_token(str(first_user_id))

    response = client.put(
        "/settings/profile",
        headers={"Authorization": f"Bearer {first_access_token}"},
        json={
            "first_name": "First",
            "last_name": "User",
        },
    )

    assert response.status_code == 200

    async with SessionFactory() as session:
        first_user = await session.get(User, first_user_id)
        second_user = await session.get(User, second_user_id)

    assert first_user is not None
    assert second_user is not None

    assert first_user.email == first_email
    assert first_user.first_name == "First"
    assert first_user.last_name == "User"

    assert second_user.email == second_email
    assert second_user.first_name is None
    assert second_user.last_name is None
