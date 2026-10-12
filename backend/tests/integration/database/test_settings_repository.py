from uuid import uuid4

import pytest

from app.core.security import hash_password
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
from app.infrastructure.repositories.settings import SettingsRepository


async def create_user() -> int:
    """Create a user for settings repository tests."""
    email = f"settings-repository-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("CurrentPassword123!"),
        )
        session.add(user)
        await session.commit()

        return user.id


@pytest.mark.anyio
async def test_get_by_user_id_returns_user_settings() -> None:
    """Return the settings belonging to the requested user."""
    user_id = await create_user()

    async with SessionFactory() as session:
        repository = SettingsRepository(session)

        result = await repository.get_by_user_id(user_id)

    assert result is not None
    assert result.id == user_id


@pytest.mark.anyio
async def test_get_by_unknown_user_id_returns_none() -> None:
    """Return None when no user exists for the requested ID."""
    async with SessionFactory() as session:
        repository = SettingsRepository(session)

        result = await repository.get_by_user_id(999999999)

    assert result is None


@pytest.mark.anyio
async def test_update_profile_persists_first_and_last_name() -> None:
    """Persist the user's required profile information."""
    user_id = await create_user()

    async with SessionFactory() as session:
        repository = SettingsRepository(session)

        user = await repository.update_profile(
            user_id=user_id,
            first_name="Test",
            last_name="User",
        )

        await session.commit()

        assert user.first_name == "Test"
        assert user.last_name == "User"

    async with SessionFactory() as session:
        persisted_user = await session.get(User, user_id)

    assert persisted_user is not None
    assert persisted_user.first_name == "Test"
    assert persisted_user.last_name == "User"


@pytest.mark.anyio
async def test_update_profile_raises_for_unknown_user() -> None:
    """Raise an error when updating a non-existent user."""
    async with SessionFactory() as session:
        repository = SettingsRepository(session)

        with pytest.raises(ValueError, match="User not found."):
            await repository.update_profile(
                user_id=999999999,
                first_name="Test",
                last_name="User",
            )


@pytest.mark.anyio
async def test_update_preferences_persists_language_and_theme() -> None:
    """Persist language and theme preferences."""
    user_id = await create_user()

    async with SessionFactory() as session:
        repository = SettingsRepository(session)

        user = await repository.update_preferences(
            user_id=user_id,
            language="de",
            theme="dark",
        )

        await session.commit()

        assert user.language == "de"
        assert user.theme == "dark"

    async with SessionFactory() as session:
        persisted_user = await session.get(User, user_id)

    assert persisted_user is not None
    assert persisted_user.language == "de"
    assert persisted_user.theme == "dark"


@pytest.mark.anyio
async def test_update_preferences_raises_for_unknown_user() -> None:
    """Raise an error when updating preferences for a missing user."""
    async with SessionFactory() as session:
        repository = SettingsRepository(session)

        with pytest.raises(ValueError, match="User not found."):
            await repository.update_preferences(
                user_id=999999999,
                language="en",
                theme="system",
            )


@pytest.mark.anyio
async def test_update_notifications_persists_preferences() -> None:
    """Persist notification preferences."""
    user_id = await create_user()

    async with SessionFactory() as session:
        repository = SettingsRepository(session)

        user = await repository.update_notifications(
            user_id=user_id,
            notify_transaction_completed=False,
            notify_money_received=True,
            notify_transaction_failed=False,
        )

        await session.commit()

        assert user.notify_transaction_completed is False
        assert user.notify_money_received is True
        assert user.notify_transaction_failed is False

    async with SessionFactory() as session:
        persisted_user = await session.get(User, user_id)

    assert persisted_user is not None
    assert persisted_user.notify_transaction_completed is False
    assert persisted_user.notify_money_received is True
    assert persisted_user.notify_transaction_failed is False


@pytest.mark.anyio
async def test_update_notifications_raises_for_unknown_user() -> None:
    """Raise an error when updating notifications for a missing user."""
    async with SessionFactory() as session:
        repository = SettingsRepository(session)

        with pytest.raises(ValueError, match="User not found."):
            await repository.update_notifications(
                user_id=999999999,
                notify_transaction_completed=True,
                notify_money_received=True,
                notify_transaction_failed=True,
            )


@pytest.mark.anyio
async def test_update_password_persists_password_hash() -> None:
    """Persist a new password hash."""
    user_id = await create_user()
    password_hash = hash_password("NewPassword123!")

    async with SessionFactory() as session:
        repository = SettingsRepository(session)

        user = await repository.update_password(
            user_id=user_id,
            password_hash=password_hash,
        )

        await session.commit()

        assert user.password_hash == password_hash

    async with SessionFactory() as session:
        persisted_user = await session.get(User, user_id)

    assert persisted_user is not None
    assert persisted_user.password_hash == password_hash


@pytest.mark.anyio
async def test_update_password_raises_for_unknown_user() -> None:
    """Raise an error when updating a password for a missing user."""
    async with SessionFactory() as session:
        repository = SettingsRepository(session)

        with pytest.raises(ValueError, match="User not found."):
            await repository.update_password(
                user_id=999999999,
                password_hash=hash_password("NewPassword123!"),
            )
