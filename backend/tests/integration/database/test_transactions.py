from uuid import uuid4

import pytest
from sqlalchemy import select

from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory


@pytest.mark.anyio
async def test_rollback_discards_uncommitted_changes() -> None:
    email = f"rollback-test-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(email=email)
        session.add(user)
        await session.rollback()

    async with SessionFactory() as session:
        result = await session.scalar(
            select(User).where(User.email == email)
        )

    assert result is None


@pytest.mark.anyio
async def test_committed_changes_are_persisted() -> None:
    email = f"commit-test-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(email=email)
        session.add(user)
        await session.commit()

    async with SessionFactory() as session:
        result = await session.scalar(
            select(User).where(User.email == email)
        )

    assert result is not None
    assert result.email == email
