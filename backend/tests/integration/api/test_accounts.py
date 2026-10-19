from datetime import datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
from app.infrastructure.repositories.account import AccountRepository
from app.main import app

client = TestClient(app)


@pytest.mark.anyio
async def test_create_account_requires_authentication() -> None:
    """Reject account creation without authentication."""
    response = client.post("/accounts")

    assert response.status_code == 401


@pytest.mark.anyio
async def test_create_account_creates_financial_account_for_authenticated_user() -> (
    None
):
    """Create an account owned by the authenticated user."""
    email = f"account-api-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("test-password"),
            first_name="Test",
            last_name="User",
        )
        session.add(user)
        await session.commit()

        user_id = user.id

    access_token = create_access_token(str(user_id))

    response = client.post(
        "/accounts",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 201

    data = response.json()

    assert data["id"]
    assert data["user_id"] == user_id
    assert data["balance"] == "0.0000"
    assert data["bic"] == "IDEMDEFFXXX"
    assert "created_at" in data

    created_at = datetime.fromisoformat(data["created_at"])

    assert created_at.tzinfo is not None

    async with SessionFactory() as session:
        account = await session.get(Account, data["id"])

    assert account is not None
    assert account.user_id == user_id
    assert account.balance == 0


@pytest.mark.anyio
async def test_create_account_ignores_client_provided_user_id() -> None:
    """Create the account for the authenticated user regardless of client input."""
    first_email = f"account-owner-{uuid4()}@example.com"
    second_email = f"account-attacker-{uuid4()}@example.com"

    async with SessionFactory() as session:
        first_user = User(
            email=first_email,
            password_hash=hash_password("test-password"),
            first_name="Test",
            last_name="User",
        )
        second_user = User(
            email=second_email,
            password_hash=hash_password("test-password"),
            first_name="Other",
            last_name="User",
        )
        session.add_all([first_user, second_user])
        await session.commit()

        authenticated_user_id = first_user.id
        other_user_id = second_user.id

    access_token = create_access_token(str(authenticated_user_id))

    response = client.post(
        "/accounts",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"user_id": other_user_id},
    )

    assert response.status_code == 201

    data = response.json()

    assert data["user_id"] == authenticated_user_id
    assert data["user_id"] != other_user_id


@pytest.mark.anyio
async def test_get_my_account_requires_authentication() -> None:
    """Reject account retrieval without authentication."""
    response = client.get("/accounts/me")

    assert response.status_code == 401


@pytest.mark.anyio
async def test_get_my_account_returns_authenticated_users_account() -> None:
    """Return the financial account belonging to the authenticated user."""
    first_email = f"account-me-first-{uuid4()}@example.com"
    second_email = f"account-me-second-{uuid4()}@example.com"

    async with SessionFactory() as session:
        first_user = User(
            email=first_email,
            password_hash=hash_password("test-password"),
            first_name="Test",
            last_name="User",
        )
        second_user = User(
            email=second_email,
            password_hash=hash_password("test-password"),
            first_name="Other",
            last_name="User",
        )
        session.add_all([first_user, second_user])
        await session.flush()

        repository = AccountRepository(session)
        first_account = await repository.create(user_id=first_user.id)
        await repository.create(user_id=second_user.id)
        await session.commit()

        first_user_id = first_user.id
        first_account_id = first_account.id

    access_token = create_access_token(str(first_user_id))

    response = client.get(
        "/accounts/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["id"] == first_account_id
    assert data["user_id"] == first_user_id
    assert data["balance"] == "0.0000"
    assert data["bic"] == "IDEMDEFFXXX"
    assert "created_at" in data

    created_at = datetime.fromisoformat(data["created_at"])

    assert created_at.tzinfo is not None


@pytest.mark.anyio
async def test_create_account_rejects_incomplete_profile() -> None:
    """Reject account access until required profile information is completed."""
    email = f"account-incomplete-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("test-password"),
        )
        session.add(user)
        await session.commit()

        user_id = user.id

    access_token = create_access_token(str(user_id))

    response = client.post(
        "/accounts",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Profile completion is required.",
    }


@pytest.mark.anyio
async def test_get_my_accounts_returns_only_the_authenticated_users_accounts() -> None:
    """List all of the authenticated user's accounts without leaking others."""
    async with SessionFactory() as session:
        owner = User(
            email=f"accounts-list-owner-{uuid4()}@example.com",
            password_hash=hash_password("test-password"),
            first_name="Account",
            last_name="Owner",
        )
        other_user = User(
            email=f"accounts-list-other-{uuid4()}@example.com",
            password_hash=hash_password("test-password"),
            first_name="Other",
            last_name="User",
        )
        session.add_all([owner, other_user])
        await session.flush()
        repository = AccountRepository(session)
        first_account = await repository.create(user_id=owner.id)
        second_account = await repository.create(user_id=owner.id)
        await repository.create(user_id=other_user.id)
        owner_id = owner.id
        expected_account_ids = {first_account.id, second_account.id}
        await session.commit()

    token = create_access_token(str(owner_id))
    response = client.get(
        "/accounts",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert {item["id"] for item in data} == expected_account_ids
    assert all(item["user_id"] == owner_id for item in data)


@pytest.mark.anyio
async def test_get_my_accounts_requires_authentication() -> None:
    """Protect the account list endpoint."""
    response = client.get("/accounts")

    assert response.status_code == 401
