from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
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

    async with SessionFactory() as session:
        account = await session.get(Account, data["id"])

    assert account is not None
    assert account.user_id == user_id
    assert account.balance == 0
