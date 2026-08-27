from uuid import uuid4

import pytest

from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory


@pytest.mark.anyio
async def test_committed_user_can_be_retrieved_from_new_session() -> None:
    email = f"persistence-test-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(email=email)
        session.add(user)
        await session.commit()

    async with SessionFactory() as session:
        result = await session.get(User, user.id)

    assert result is not None
    assert result.email == email
