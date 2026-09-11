"""Tests for password hashing and verification."""

from app.core.security import hash_password, verify_password


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
