from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.domain.account.iban import generate_account_number
from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.transaction import Transaction
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
from app.infrastructure.repositories.account import AccountRepository
from app.infrastructure.repositories.transaction import TransactionRepository
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


@pytest.mark.anyio
async def test_create_account_persists_account_for_user() -> None:
    """Create and persist an account for the given user."""
    email = f"account-repository-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash="test-password-hash",
        )
        session.add(user)
        await session.flush()

        repository = AccountRepository(session)
        account = await repository.create(user_id=user.id)

        await session.commit()

        account_id = account.id
        user_id = user.id

    async with SessionFactory() as session:
        result = await session.execute(
            select(Account)
            .options(selectinload(Account.institution))
            .where(Account.id == account_id)
        )
        persisted_account = result.scalar_one_or_none()

    assert persisted_account is not None
    assert persisted_account.id == account_id
    assert persisted_account.user_id == user_id
    assert persisted_account.balance == 0
    assert persisted_account.account_number.isdigit()
    assert len(persisted_account.account_number) == 10
    assert persisted_account.iban.startswith("DE")
    assert len(persisted_account.iban) == 22
    assert persisted_account.created_at is not None
    assert persisted_account.created_at.tzinfo is not None
    assert persisted_account.institution.bic == "IDEMDEFFXXX"


@pytest.mark.anyio
async def test_create_account_retries_after_account_number_collision() -> None:
    """Retry account number generation when the candidate already exists."""
    email = f"account-retry-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash="test-password-hash",
        )
        session.add(user)
        await session.flush()

        repository = AccountRepository(session)
        existing_account = await repository.create(user_id=user.id)
        await session.flush()

        replacement_account_number = generate_account_number()

        with (
            patch.object(
                repository,
                "get_by_account_number",
                side_effect=[existing_account, None],
            ),
            patch(
                "app.infrastructure.repositories.account.generate_account_number",
                side_effect=[
                    existing_account.account_number,
                    replacement_account_number,
                ],
            ),
        ):
            account = await repository.create(user_id=user.id)

        await session.commit()

    assert account.account_number == replacement_account_number
    assert account.iban.endswith(replacement_account_number)


@pytest.mark.anyio
async def test_create_account_raises_after_ten_account_number_collisions() -> None:
    """Raise an error when no unique account number can be allocated."""
    email = f"account-collision-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash="test-password-hash",
        )
        session.add(user)
        await session.flush()

        repository = AccountRepository(session)
        existing_account = await repository.create(user_id=user.id)
        await session.flush()

        with (
            patch.object(
                repository,
                "get_by_account_number",
                return_value=existing_account,
            ),
            patch(
                "app.infrastructure.repositories.account.generate_account_number",
                return_value=existing_account.account_number,
            ),
        ):
            with pytest.raises(
                RuntimeError,
                match="Unable to allocate a unique account number.",
            ):
                await repository.create(user_id=user.id)

        await session.rollback()


@pytest.mark.anyio
async def test_get_account_by_user_id_returns_matching_account() -> None:
    """Return the account belonging to the given user."""
    email = f"account-get-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash="test-password-hash",
        )
        session.add(user)
        await session.flush()

        repository = AccountRepository(session)
        account = await repository.create(user_id=user.id)
        await session.commit()

        result = await repository.get_by_user_id(user.id)

    assert result is not None
    assert result.id == account.id
    assert result.user_id == user.id
    assert result.balance == 0


@pytest.mark.anyio
async def test_get_account_by_unknown_user_id_returns_none() -> None:
    """Return None when the user has no financial account."""
    async with SessionFactory() as session:
        repository = AccountRepository(session)

        result = await repository.get_by_user_id(user_id=999999999)

    assert result is None


@pytest.mark.anyio
async def test_create_transaction_persists_transaction() -> None:
    """Create and persist a transaction between two accounts."""
    source_email = f"transaction-source-{uuid4()}@example.com"
    destination_email = f"transaction-destination-{uuid4()}@example.com"

    async with SessionFactory() as session:
        source_user = User(
            email=source_email,
            password_hash="test-password-hash",
        )
        destination_user = User(
            email=destination_email,
            password_hash="test-password-hash",
        )
        session.add_all([source_user, destination_user])
        await session.flush()

        account_repository = AccountRepository(session)
        source_account = await account_repository.create(
            user_id=source_user.id,
        )
        destination_account = await account_repository.create(
            user_id=destination_user.id,
        )

        repository = TransactionRepository(session)
        transaction = await repository.create(
            source_account_id=source_account.id,
            destination_account_id=destination_account.id,
            amount=Decimal("100.00"),
            transaction_type="TRANSFER",
            status="COMPLETED",
        )

        assert transaction.id is not None
        assert transaction.source_account_id == source_account.id
        assert transaction.destination_account_id == destination_account.id
        assert transaction.amount == Decimal("100.00")
        assert transaction.transaction_type == "TRANSFER"
        assert transaction.status == "COMPLETED"
        assert transaction.created_at is not None
        assert transaction.created_at.tzinfo is not None

        await session.commit()


@pytest.mark.anyio
async def test_create_transaction_does_not_commit_transaction() -> None:
    """Leave transaction commit control to the calling application layer."""
    source_email = f"transaction-rollback-source-{uuid4()}@example.com"
    destination_email = f"transaction-rollback-destination-{uuid4()}@example.com"

    async with SessionFactory() as session:
        source_user = User(
            email=source_email,
            password_hash="test-password-hash",
        )
        destination_user = User(
            email=destination_email,
            password_hash="test-password-hash",
        )
        session.add_all([source_user, destination_user])
        await session.flush()

        account_repository = AccountRepository(session)
        source_account = await account_repository.create(
            user_id=source_user.id,
        )
        destination_account = await account_repository.create(
            user_id=destination_user.id,
        )

        repository = TransactionRepository(session)
        transaction = await repository.create(
            source_account_id=source_account.id,
            destination_account_id=destination_account.id,
            amount=Decimal("100.00"),
            transaction_type="TRANSFER",
            status="COMPLETED",
        )

        transaction_id = transaction.id

        await session.rollback()

    async with SessionFactory() as session:
        result = await session.execute(
            select(Transaction).where(Transaction.id == transaction_id)
        )
        persisted_transaction = result.scalar_one_or_none()

    assert persisted_transaction is None
