from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.security import decode_access_token, hash_password
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
from app.main import app

client = TestClient(app)


@pytest.mark.anyio
async def test_login_returns_valid_access_token_for_valid_credentials() -> None:
    """Return a valid JWT access token when valid credentials are provided."""
    email = f"login-{uuid4()}@example.com"
    password = "correct-password"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password(password),
        )
        session.add(user)
        await session.commit()
        user_id = user.id

    response = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["token_type"] == "bearer"
    assert data["access_token"]

    payload = decode_access_token(data["access_token"])

    assert payload["sub"] == str(user_id)


@pytest.mark.anyio
async def test_login_rejects_invalid_password() -> None:
    """Reject login attempts with an invalid password."""
    email = f"invalid-password-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("correct-password"),
        )
        session.add(user)
        await session.commit()

    response = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": "wrong-password",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials."}


@pytest.mark.anyio
async def test_login_rejects_unknown_email() -> None:
    """Reject login attempts for unknown email addresses."""
    response = client.post(
        "/auth/login",
        json={
            "email": f"unknown-{uuid4()}@example.com",
            "password": "correct-password",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials."}


@pytest.mark.anyio
async def test_login_rejects_inactive_user() -> None:
    """Reject login attempts for inactive users."""
    email = f"inactive-{uuid4()}@example.com"
    password = "correct-password"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password(password),
            is_active=False,
        )
        session.add(user)
        await session.commit()

    response = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials."}


def test_login_rejects_invalid_email() -> None:
    """Reject login requests with an invalid email address."""
    response = client.post(
        "/auth/login",
        json={
            "email": "not-an-email",
            "password": "correct-password",
        },
    )

    assert response.status_code == 422


def test_login_rejects_missing_email() -> None:
    """Reject login requests when the email is missing."""
    response = client.post(
        "/auth/login",
        json={
            "password": "correct-password",
        },
    )

    assert response.status_code == 422


def test_login_rejects_missing_password() -> None:
    """Reject login requests when the password is missing."""
    response = client.post(
        "/auth/login",
        json={
            "email": "user@example.com",
        },
    )

    assert response.status_code == 422
