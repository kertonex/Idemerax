from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from psycopg.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
)
from app.infrastructure.database.models.refresh_session import RefreshSession
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
            "password": "wrong-password-value",
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


@pytest.mark.anyio
async def test_get_current_user_returns_authenticated_user() -> None:
    """Return the authenticated user for a valid access token."""
    email = f"me-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("correct-password"),
        )
        session.add(user)
        await session.commit()
        user_id = user.id

    access_token = create_access_token(str(user_id))

    response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200

    data = response.json()

    assert data == {
        "id": user_id,
        "email": email,
        "role": "USER",
        "is_active": True,
    }
    assert "password_hash" not in data


def test_get_current_user_rejects_missing_token() -> None:
    """Reject requests without an access token."""
    response = client.get("/auth/me")

    assert response.status_code == 401


def test_get_current_user_rejects_invalid_token() -> None:
    """Reject requests with an invalid access token."""
    response = client.get(
        "/auth/me",
        headers={"Authorization": "Bearer invalid-token"},
    )

    assert response.status_code == 401


@pytest.mark.anyio
async def test_get_current_user_rejects_unknown_user() -> None:
    """Reject valid tokens for users that do not exist."""
    access_token = create_access_token("999999999")

    response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 401


@pytest.mark.anyio
async def test_get_current_user_rejects_inactive_user() -> None:
    """Reject valid tokens for inactive users."""
    email = f"inactive-me-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("correct-password"),
            is_active=False,
        )
        session.add(user)
        await session.commit()
        user_id = user.id

    access_token = create_access_token(str(user_id))

    response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 401


@pytest.mark.anyio
async def test_register_creates_user_and_returns_access_token() -> None:
    """Create a new user and return a valid JWT access token."""
    email = f"register-{uuid4()}@example.com"
    password = "TestPassword123!"

    response = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["token_type"] == "bearer"
    assert data["access_token"]

    payload = decode_access_token(data["access_token"])

    async with SessionFactory() as session:
        user = await session.get(User, int(payload["sub"]))

    assert user is not None
    assert user.email == email
    assert user.password_hash is not None
    assert user.password_hash != password


@pytest.mark.anyio
async def test_register_hashes_password() -> None:
    """Store the registered password as an Argon2id hash."""
    email = f"hashed-{uuid4()}@example.com"
    password = "TestPassword123!"

    response = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
        },
    )

    assert response.status_code == 201

    payload = decode_access_token(response.json()["access_token"])

    async with SessionFactory() as session:
        user = await session.get(User, int(payload["sub"]))

    assert user is not None
    assert user.password_hash is not None
    assert user.password_hash.startswith("$argon2")


@pytest.mark.anyio
async def test_register_rejects_existing_email() -> None:
    """Reject registration when the email address is already registered."""
    email = f"existing-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("existing-password"),
        )
        session.add(user)
        await session.commit()

    response = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "new-password-value",
        },
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Email address is already registered.",
    }


def test_register_rejects_invalid_email() -> None:
    """Reject registration requests with an invalid email address."""
    response = client.post(
        "/auth/register",
        json={
            "email": "not-an-email",
            "password": "TestPassword123!",
        },
    )

    assert response.status_code == 422


def test_register_rejects_missing_email() -> None:
    """Reject registration requests when the email is missing."""
    response = client.post(
        "/auth/register",
        json={
            "password": "TestPassword123!",
        },
    )

    assert response.status_code == 422


def test_register_rejects_missing_password() -> None:
    """Reject registration requests when the password is missing."""
    response = client.post(
        "/auth/register",
        json={
            "email": f"missing-password-{uuid4()}@example.com",
        },
    )

    assert response.status_code == 422


def test_register_rejects_database_unique_violation() -> None:
    """Return a conflict when registration hits a unique constraint."""
    unique_violation = UniqueViolation(
        'duplicate key value violates unique constraint "users_email_key"',
    )
    integrity_error = IntegrityError(
        "INSERT INTO users",
        {},
        unique_violation,
    )

    with patch(
        "app.api.routes.authentication.RegisterUser.execute",
        side_effect=integrity_error,
    ):
        response = client.post(
            "/auth/register",
            json={
                "email": f"race-{uuid4()}@example.com",
                "password": "TestPassword123!",
            },
        )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Email address is already registered.",
    }


@pytest.mark.anyio
async def test_refresh_does_not_return_refresh_token_in_response() -> None:
    """Do not expose the rotated refresh token in the response body."""
    email = f"refresh-response-{uuid4()}@example.com"
    refresh_token = create_refresh_token()

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("correct-password"),
        )
        session.add(user)
        await session.flush()

        refresh_session = RefreshSession(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )
        session.add(refresh_session)
        await session.commit()

    with TestClient(app) as test_client:
        test_client.cookies.set(
            "__Host-refresh_token",
            refresh_token,
        )

        response = test_client.post("/auth/refresh")

    assert response.status_code == 200

    data = response.json()

    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert "refresh_token" not in data


@pytest.mark.anyio
async def test_logout_revokes_refresh_session() -> None:
    """Revoke the refresh session when the user logs out."""
    email = f"logout-{uuid4()}@example.com"
    refresh_token = create_refresh_token()

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("correct-password"),
        )
        session.add(user)
        await session.flush()

        refresh_session = RefreshSession(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )
        session.add(refresh_session)
        await session.commit()
        refresh_session_id = refresh_session.id

    with TestClient(app) as test_client:
        test_client.cookies.set(
            "__Host-refresh_token",
            refresh_token,
        )

        response = test_client.post("/auth/logout")

    assert response.status_code == 204

    async with SessionFactory() as session:
        revoked_session = await session.get(
            RefreshSession,
            refresh_session_id,
        )

    assert revoked_session is None


@pytest.mark.anyio
async def test_logout_invalidates_refresh_token() -> None:
    """Reject the refresh token after logout."""
    email = f"logout-refresh-{uuid4()}@example.com"
    refresh_token = create_refresh_token()

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("correct-password"),
        )
        session.add(user)
        await session.flush()

        refresh_session = RefreshSession(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )
        session.add(refresh_session)
        await session.commit()

    with TestClient(app) as test_client:
        test_client.cookies.set(
            "__Host-refresh_token",
            refresh_token,
        )

        logout_response = test_client.post("/auth/logout")

        test_client.cookies.set(
            "__Host-refresh_token",
            refresh_token,
        )
        refresh_response = test_client.post("/auth/refresh")

    assert logout_response.status_code == 204
    assert refresh_response.status_code == 401
    assert refresh_response.json() == {
        "detail": "Invalid refresh session.",
    }


def test_logout_without_refresh_token_succeeds() -> None:
    """Allow logout when no refresh token cookie is present."""
    with TestClient(app) as test_client:
        response = test_client.post("/auth/logout")

    assert response.status_code == 204
