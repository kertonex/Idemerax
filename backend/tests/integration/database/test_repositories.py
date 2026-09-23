from uuid import uuid4

import pytest

from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
from app.infrastructure.repositories.user import UserRepository


@pytest.mark.anyio
async def test_get_user_by_email_returns_matching_user() -> None:
    email = f"repository-test-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash="test-password-hash",
        )
        session.add(user)
        await session.commit()

        repository = UserRepository(session)
        result = await repository.get_by_email(email)

    assert result is not None
    assert result.email == email
    assert result.password_hash == "test-password-hash"


@pytest.mark.anyio
async def test_get_user_by_unknown_email_returns_none() -> None:
    email = f"unknown-{uuid4()}@example.com"

    async with SessionFactory() as session:
        repository = UserRepository(session)

        result = await repository.get_by_email(email)

    assert result is None


@pytest.mark.anyio
async def test_get_user_by_email_returns_correct_user() -> None:
    first_email = f"first-{uuid4()}@example.com"
    second_email = f"second-{uuid4()}@example.com"

    async with SessionFactory() as session:
        first_user = User(
            email=first_email,
            password_hash="first-password-hash",
        )
        second_user = User(
            email=second_email,
            password_hash="second-password-hash",
        )

        session.add_all([first_user, second_user])
        await session.commit()

        repository = UserRepository(session)
        result = await repository.get_by_email(second_email)

    assert result is not None
    assert result.email == second_email
    assert result.password_hash == "second-password-hash"


@pytest.mark.anyio
async def test_get_user_by_email_is_case_sensitive() -> None:
    email = f"case-test-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash="test-password-hash",
        )
        session.add(user)
        await session.commit()

        repository = UserRepository(session)
        result = await repository.get_by_email(email.upper())

    assert result is None


@pytest.mark.anyio
async def test_get_user_by_email_does_not_strip_whitespace() -> None:
    email = f"whitespace-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash="test-password-hash",
        )
        session.add(user)
        await session.commit()

        repository = UserRepository(session)
        result = await repository.get_by_email(f" {email} ")

    assert result is None


@pytest.mark.anyio
async def test_get_user_by_email_returns_inactive_user() -> None:
    email = f"inactive-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash="test-password-hash",
            is_active=False,
        )
        session.add(user)
        await session.commit()

        repository = UserRepository(session)
        result = await repository.get_by_email(email)

    assert result is not None
    assert result.email == email
    assert result.is_active is False
