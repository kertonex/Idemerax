from decimal import Decimal
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


async def create_user_with_account(
    balance: str = "1000.0000",
) -> tuple[int, Account]:
    """Create a user with a funded account for idempotency status tests."""
    email = f"idempotency-status-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("test-password"),
            first_name="Test",
            last_name="User",
        )
        session.add(user)
        await session.flush()

        account_repository = AccountRepository(session)
        account = await account_repository.create(user_id=user.id)
        account.balance = Decimal(balance)

        await session.commit()

        return user.id, account


def authenticated_headers(user_id: int) -> dict[str, str]:
    """Create authenticated request headers."""
    return {
        "Authorization": f"Bearer {create_access_token(str(user_id))}",
    }


def transaction_headers(user_id: int, idempotency_key: str) -> dict[str, str]:
    """Create headers for an idempotent transaction request."""
    return {
        **authenticated_headers(user_id),
        "Idempotency-Key": idempotency_key,
    }


@pytest.mark.anyio
async def test_get_idempotency_status_requires_authentication() -> None:
    """Reject status requests without an authenticated user."""
    response = client.get(
        "/transactions/idempotency/status-auth-required",
    )

    assert response.status_code == 401


@pytest.mark.anyio
async def test_get_idempotency_status_returns_not_found_for_unknown_key() -> None:
    """Return NOT_FOUND when the user's account has no matching key."""
    user_id, _ = await create_user_with_account()
    idempotency_key = f"unknown-status-{uuid4()}"

    response = client.get(
        f"/transactions/idempotency/{idempotency_key}",
        headers=authenticated_headers(user_id),
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "NOT_FOUND",
        "transaction": None,
        "failure_code": None,
    }


@pytest.mark.anyio
async def test_get_idempotency_status_returns_completed_transaction() -> None:
    """Return the persisted transaction for its original idempotency key."""
    source_user_id, source_account = await create_user_with_account(
        "1000.0000",
    )
    _, destination_account = await create_user_with_account("250.0000")

    idempotency_key = f"completed-status-{uuid4()}"

    create_response = client.post(
        "/transactions",
        headers=transaction_headers(source_user_id, idempotency_key),
        json={
            "destination_iban": destination_account.iban,
            "amount": "125.5000",
            "reference": "Status recovery test",
        },
    )

    assert create_response.status_code == 201

    created_transaction = create_response.json()

    status_response = client.get(
        f"/transactions/idempotency/{idempotency_key}",
        headers=authenticated_headers(source_user_id),
    )

    assert status_response.status_code == 200

    status_data = status_response.json()

    assert status_data["status"] == "COMPLETED"
    assert status_data["transaction"] is not None
    assert status_data["transaction"]["id"] == created_transaction["id"]
    assert status_data["transaction"]["source_account_id"] == source_account.id
    assert (
        status_data["transaction"]["destination_account_id"] == destination_account.id
    )
    assert status_data["transaction"]["amount"] == "125.5000"
    assert status_data["transaction"]["status"] == "COMPLETED"

    replay_response = client.post(
        "/transactions",
        headers=transaction_headers(source_user_id, idempotency_key),
        json={
            "destination_iban": destination_account.iban,
            "amount": "125.5000",
            "reference": "Status recovery test",
        },
    )

    assert replay_response.status_code == 200
    assert replay_response.json()["id"] == created_transaction["id"]

    async with SessionFactory() as session:
        persisted_source = await session.get(Account, source_account.id)
        persisted_destination = await session.get(
            Account,
            destination_account.id,
        )

    assert persisted_source is not None
    assert persisted_destination is not None
    assert persisted_source.balance == Decimal("874.5000")
    assert persisted_destination.balance == Decimal("375.5000")


@pytest.mark.anyio
async def test_get_idempotency_status_does_not_expose_another_users_transaction() -> (
    None
):
    """Do not reveal another user's transaction when keys are known."""
    first_user_id, _ = await create_user_with_account("1000.0000")
    second_user_id, _ = await create_user_with_account("1000.0000")
    _, destination_account = await create_user_with_account("250.0000")

    idempotency_key = f"isolated-status-{uuid4()}"

    create_response = client.post(
        "/transactions",
        headers=transaction_headers(first_user_id, idempotency_key),
        json={
            "destination_iban": destination_account.iban,
            "amount": "100.00",
        },
    )

    assert create_response.status_code == 201

    response = client.get(
        f"/transactions/idempotency/{idempotency_key}",
        headers=authenticated_headers(second_user_id),
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "NOT_FOUND",
        "transaction": None,
        "failure_code": None,
    }


@pytest.mark.anyio
async def test_get_idempotency_status_rejects_key_longer_than_limit() -> None:
    """Reject a status request whose key exceeds the API's 128-character limit."""
    user_id, _ = await create_user_with_account()
    invalid_key = "x" * 129

    response = client.get(
        f"/transactions/idempotency/{invalid_key}",
        headers=authenticated_headers(user_id),
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_get_idempotency_status_rejects_invalid_key_characters() -> None:
    """Reject a status request containing characters outside the key format."""
    user_id, _ = await create_user_with_account()
    invalid_key = "invalid key"

    response = client.get(
        f"/transactions/idempotency/{invalid_key}",
        headers=authenticated_headers(user_id),
    )

    assert response.status_code == 422
