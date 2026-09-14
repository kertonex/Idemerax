"""Tests for password hashing, verification, and JWT handling."""

import base64
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import jwt
import pytest

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

# ── Password hashing ────────────────────────────────────────────────────────


def test_hash_password_returns_argon2_hash() -> None:
    """Verify that passwords are hashed using Argon2."""
    password = "my_secure_password"

    password_hash = hash_password(password)

    assert password_hash != password
    assert password_hash.startswith("$argon2")


def test_hash_password_generates_unique_hashes() -> None:
    """Verify that hashing the same password generates unique hashes."""
    password = "my_secure_password"

    first_hash = hash_password(password)
    second_hash = hash_password(password)

    assert first_hash != second_hash
    assert verify_password(password, first_hash) is True
    assert verify_password(password, second_hash) is True


def test_verify_password_with_correct_password() -> None:
    """Verify that the correct password is accepted."""
    password = "my_secure_password"
    password_hash = hash_password(password)

    assert verify_password(password, password_hash) is True


def test_hash_password_with_long_password() -> None:
    """Verify that long passwords can be hashed and verified."""
    password = "a" * 1000

    password_hash = hash_password(password)

    assert verify_password(password, password_hash) is True


def test_hash_password_with_special_characters() -> None:
    """Verify that passwords with special characters are supported."""
    password = "Pässwörd!@#$%^&*()_+🔐"

    password_hash = hash_password(password)

    assert verify_password(password, password_hash) is True


def test_hash_password_with_numeric_password() -> None:
    """Verify that numeric passwords can be hashed and verified."""
    password = "1234567890"

    password_hash = hash_password(password)

    assert verify_password(password, password_hash) is True


def test_verify_password_is_case_sensitive() -> None:
    """Verify that password verification is case-sensitive."""
    password = "MySecurePassword123"
    password_hash = hash_password(password)

    assert verify_password("mysecurepassword123", password_hash) is False


def test_verify_password_does_not_ignore_leading_whitespace() -> None:
    """Verify that leading whitespace is treated as part of the password."""
    password = "my_secure_password"
    password_hash = hash_password(password)

    assert verify_password(" my_secure_password", password_hash) is False


def test_verify_password_does_not_ignore_trailing_whitespace() -> None:
    """Verify that trailing whitespace is treated as part of the password."""
    password = "my_secure_password"
    password_hash = hash_password(password)

    assert verify_password("my_secure_password ", password_hash) is False


def test_verify_password_with_empty_password() -> None:
    """Verify that an empty password can be hashed and verified."""
    password_hash = hash_password("")

    assert verify_password("", password_hash) is True


def test_verify_password_with_whitespace_only_password() -> None:
    """Verify that a whitespace-only password is handled consistently."""
    password = "   "
    password_hash = hash_password(password)

    assert verify_password(password, password_hash) is True


def test_hash_password_with_unicode_characters() -> None:
    """Verify that Unicode characters are supported in passwords."""
    password = "пароль密码🔐"

    password_hash = hash_password(password)

    assert verify_password(password, password_hash) is True


def test_verify_password_with_wrong_password() -> None:
    """Verify that an incorrect password is rejected."""
    password = "my_secure_password"
    password_hash = hash_password(password)

    assert verify_password("wrong_password", password_hash) is False


def test_verify_password_with_hash_from_different_password() -> None:
    """Verify that a hash for another password is rejected."""
    password_hash = hash_password("another_password")

    assert verify_password("my_secure_password", password_hash) is False


def test_verify_password_with_invalid_hash() -> None:
    """Verify that an invalid password hash is rejected."""
    password = "my_secure_password"

    assert verify_password(password, "invalid_hash") is False


def test_verify_password_with_empty_hash() -> None:
    """Verify that an empty password hash is rejected."""
    password = "my_secure_password"

    assert verify_password(password, "") is False


def test_verify_password_with_modified_hash() -> None:
    """Verify that a modified password hash is rejected."""
    password = "my_secure_password"
    password_hash = hash_password(password)

    modified_hash = password_hash[:-1] + "x"

    assert verify_password(password, modified_hash) is False


def test_verify_password_with_truncated_hash() -> None:
    """Verify that a truncated password hash is rejected."""
    password = "my_secure_password"
    password_hash = hash_password(password)

    truncated_hash = password_hash[:20]

    assert verify_password(password, truncated_hash) is False


# ── JWT access tokens ────────────────────────────────────────────────────────


def _create_test_token(payload: dict) -> str:
    """Create a JWT for testing with the configured signing key."""
    private_key = Path(settings.jwt_private_key_path).read_text()

    return jwt.encode(
        payload,
        private_key,
        algorithm=settings.jwt_algorithm,
    )


def test_create_access_token_returns_valid_token() -> None:
    """Verify that a valid JWT access token is created."""
    token = create_access_token("123")

    payload = decode_access_token(token)

    assert payload["sub"] == "123"


def test_create_access_token_contains_expected_claims() -> None:
    """Verify that the JWT contains the expected security claims."""
    token = create_access_token("123")

    payload = decode_access_token(token)

    assert payload["sub"] == "123"
    assert payload["iss"] == settings.jwt_issuer
    assert payload["aud"] == settings.jwt_audience
    assert "iat" in payload
    assert "exp" in payload


def test_create_access_token_has_configured_expiration() -> None:
    """Verify that the JWT uses the configured expiration time."""
    before = datetime.now(UTC)

    token = create_access_token("123")

    after = datetime.now(UTC)
    payload = decode_access_token(token)

    expiration = datetime.fromtimestamp(
        payload["exp"],
        tz=UTC,
    )

    expected_before = before + timedelta(
        minutes=settings.jwt_access_token_expire_minutes,
        seconds=-1,
    )
    expected_after = after + timedelta(
        minutes=settings.jwt_access_token_expire_minutes,
        seconds=1,
    )

    assert expected_before <= expiration <= expected_after


def test_decode_access_token_rejects_expired_token() -> None:
    """Verify that expired JWTs are rejected."""
    now = datetime.now(UTC)

    payload = {
        "sub": "123",
        "iat": now - timedelta(minutes=16),
        "exp": now - timedelta(minutes=1),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }

    token = _create_test_token(payload)

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


def test_decode_access_token_rejects_invalid_signature() -> None:
    """Verify that JWTs with invalid signatures are rejected."""
    token = create_access_token("123")

    parts = token.split(".")
    signature = base64.urlsafe_b64decode(
        parts[2] + "=" * (-len(parts[2]) % 4),
    )
    tampered_signature = bytes([signature[0] ^ 1]) + signature[1:]
    parts[2] = (
        base64.urlsafe_b64encode(
            tampered_signature,
        )
        .decode()
        .rstrip("=")
    )

    tampered_token = ".".join(parts)

    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(tampered_token)


def test_decode_access_token_rejects_wrong_issuer() -> None:
    """Verify that JWTs with an unexpected issuer are rejected."""
    now = datetime.now(UTC)

    payload = {
        "sub": "123",
        "iat": now,
        "exp": now + timedelta(minutes=15),
        "iss": "invalid-issuer",
        "aud": settings.jwt_audience,
    }

    token = _create_test_token(payload)

    with pytest.raises(jwt.InvalidIssuerError):
        decode_access_token(token)


def test_decode_access_token_rejects_wrong_audience() -> None:
    """Verify that JWTs with an unexpected audience are rejected."""
    now = datetime.now(UTC)

    payload = {
        "sub": "123",
        "iat": now,
        "exp": now + timedelta(minutes=15),
        "iss": settings.jwt_issuer,
        "aud": "invalid-audience",
    }

    token = _create_test_token(payload)

    with pytest.raises(jwt.InvalidAudienceError):
        decode_access_token(token)


def test_decode_access_token_rejects_missing_issuer() -> None:
    """Verify that JWTs without an issuer are rejected."""
    now = datetime.now(UTC)

    payload = {
        "sub": "123",
        "iat": now,
        "exp": now + timedelta(minutes=15),
        "aud": settings.jwt_audience,
    }

    token = _create_test_token(payload)

    with pytest.raises(jwt.MissingRequiredClaimError):
        decode_access_token(token)


def test_decode_access_token_rejects_missing_audience() -> None:
    """Verify that JWTs without an audience are rejected."""
    now = datetime.now(UTC)

    payload = {
        "sub": "123",
        "iat": now,
        "exp": now + timedelta(minutes=15),
        "iss": settings.jwt_issuer,
    }

    token = _create_test_token(payload)

    with pytest.raises(jwt.MissingRequiredClaimError):
        decode_access_token(token)


def test_decode_access_token_rejects_unexpected_algorithm() -> None:
    """Verify that JWTs using an unexpected algorithm are rejected."""
    now = datetime.now(UTC)

    payload = {
        "sub": "123",
        "iat": now,
        "exp": now + timedelta(minutes=15),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }

    token = jwt.encode(
        payload,
        "a" * 32,
        algorithm="HS256",
    )

    with pytest.raises(jwt.InvalidAlgorithmError):
        decode_access_token(token)


def test_decode_access_token_rejects_manipulated_payload() -> None:
    """Verify that a modified JWT payload is rejected."""
    token = create_access_token("123")

    header, payload, signature = token.split(".")

    decoded_payload = json.loads(
        base64.urlsafe_b64decode(
            payload + "=" * (-len(payload) % 4),
        ),
    )
    decoded_payload["sub"] = "999"

    modified_payload = (
        base64.urlsafe_b64encode(
            json.dumps(
                decoded_payload,
                separators=(",", ":"),
            ).encode(),
        )
        .decode()
        .rstrip("=")
    )

    tampered_token = ".".join(
        [header, modified_payload, signature],
    )

    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(tampered_token)


def test_decode_access_token_rejects_malformed_token() -> None:
    """Verify that malformed JWTs are rejected."""
    malformed_token = "not-a-valid-jwt"

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(malformed_token)
