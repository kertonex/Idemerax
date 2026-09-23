from datetime import datetime
from uuid import uuid4

import pytest

from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory


@pytest.mark.anyio
async def test_committed_user_authentication_fields_are_persisted() -> None:
    email = f"persistence-test-{uuid4()}@example.com"
    password_hash = "test-password-hash"

    # Create and commit a user with authentication fields.
    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=password_hash,
        )
        session.add(user)
        await session.commit()

        user_id = user.id

    # Load the user from a new session to verify database persistence.
    async with SessionFactory() as session:
        result = await session.get(User, user_id)

    assert result is not None
    assert result.email == email

    # Verify authentication defaults and persisted fields.
    assert result.password_hash == password_hash
    assert result.role == "USER"
    assert result.is_active is True
    assert isinstance(result.created_at, datetime)
    assert isinstance(result.updated_at, datetime)
