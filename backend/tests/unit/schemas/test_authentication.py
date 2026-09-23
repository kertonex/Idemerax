import pytest
from pydantic import ValidationError

from app.schemas.authentication import LoginRequest


def test_login_request_accepts_valid_credentials() -> None:
    """Accept valid email and password credentials."""
    request = LoginRequest(
        email="user@example.com",
        password="correct-password",
    )

    assert request.email == "user@example.com"
    assert request.password == "correct-password"


def test_login_request_requires_email() -> None:
    """Reject requests without an email address."""
    with pytest.raises(ValidationError):
        LoginRequest(password="correct-password")


def test_login_request_requires_password() -> None:
    """Reject requests without a password."""
    with pytest.raises(ValidationError):
        LoginRequest(email="user@example.com")


def test_login_request_rejects_invalid_email() -> None:
    """Reject requests with an invalid email address."""
    with pytest.raises(ValidationError):
        LoginRequest(
            email="not-an-email",
            password="correct-password",
        )
