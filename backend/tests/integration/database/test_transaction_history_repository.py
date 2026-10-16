from decimal import Decimal
from uuid import uuid4

import pytest

from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
from app.infrastructure.repositories.account import AccountRepository
from app.infrastructure.repositories.transaction import TransactionRepository


async def create_user_with_account(
    email_prefix: str,
) -> tuple[int, Account]:
    """Create a user and an associated financial account."""
    async with SessionFactory() as session:
        user = User(
            email=f"{email_prefix}-{uuid4()}@example.com",
            password_hash="test-password-hash",
            first_name="Transaction",
            last_name="Tester",
        )
        session.add(user)
        await session.flush()

        account_repository = AccountRepository(session)
        account = await account_repository.create(user_id=user.id)

        await session.commit()

        return user.id, account


@pytest.mark.anyio
async def test_list_for_user_returns_outgoing_transaction() -> None:
    """Return outgoing transactions with the correct direction."""
    source_user_id, source_account = await create_user_with_account(
        "history-outgoing-source",
    )
    _, destination_account = await create_user_with_account(
        "history-outgoing-destination",
    )

    async with SessionFactory() as session:
        repository = TransactionRepository(session)
        transaction = await repository.create(
            source_account_id=source_account.id,
            destination_account_id=destination_account.id,
            amount=Decimal("25.00"),
            transaction_type="TRANSFER",
            status="COMPLETED",
            reference="Outgoing transfer",
        )
        transaction_id = transaction.id
        await session.commit()

    async with SessionFactory() as session:
        repository = TransactionRepository(session)
        transactions, total = await repository.list_for_user(
            user_id=source_user_id,
            limit=20,
            offset=0,
        )

    assert total == 1
    assert len(transactions) == 1
    assert transactions[0][0].id == transaction_id
    assert transactions[0][1] == "outgoing"
    assert transactions[0][0].reference == "Outgoing transfer"


@pytest.mark.anyio
async def test_list_for_user_returns_incoming_transaction() -> None:
    """Return incoming transactions with the correct direction."""
    _, source_account = await create_user_with_account(
        "history-incoming-source",
    )
    destination_user_id, destination_account = await create_user_with_account(
        "history-incoming-destination",
    )

    async with SessionFactory() as session:
        repository = TransactionRepository(session)
        transaction = await repository.create(
            source_account_id=source_account.id,
            destination_account_id=destination_account.id,
            amount=Decimal("40.00"),
            transaction_type="TRANSFER",
            status="COMPLETED",
        )
        transaction_id = transaction.id
        await session.commit()

    async with SessionFactory() as session:
        repository = TransactionRepository(session)
        transactions, total = await repository.list_for_user(
            user_id=destination_user_id,
            limit=20,
            offset=0,
        )

    assert total == 1
    assert len(transactions) == 1
    assert transactions[0][0].id == transaction_id
    assert transactions[0][1] == "incoming"


@pytest.mark.anyio
async def test_list_for_user_excludes_transactions_of_other_users() -> None:
    """Do not expose transactions unrelated to the requested user."""
    _, source_account = await create_user_with_account(
        "history-private-source",
    )
    _, destination_account = await create_user_with_account(
        "history-private-destination",
    )
    unrelated_user_id, _ = await create_user_with_account(
        "history-private-unrelated",
    )

    async with SessionFactory() as session:
        repository = TransactionRepository(session)
        await repository.create(
            source_account_id=source_account.id,
            destination_account_id=destination_account.id,
            amount=Decimal("15.00"),
            transaction_type="TRANSFER",
            status="COMPLETED",
        )
        await session.commit()

    async with SessionFactory() as session:
        repository = TransactionRepository(session)
        transactions, total = await repository.list_for_user(
            user_id=unrelated_user_id,
            limit=20,
            offset=0,
        )

    assert transactions == []
    assert total == 0


@pytest.mark.anyio
async def test_list_for_user_counts_all_matching_transactions_before_pagination() -> (
    None
):
    """Return the full total even when only one transaction is requested."""
    source_user_id, source_account = await create_user_with_account(
        "history-pagination-source",
    )
    _, destination_account = await create_user_with_account(
        "history-pagination-destination",
    )

    async with SessionFactory() as session:
        repository = TransactionRepository(session)

        for amount in ("10.00", "20.00", "30.00"):
            await repository.create(
                source_account_id=source_account.id,
                destination_account_id=destination_account.id,
                amount=Decimal(amount),
                transaction_type="TRANSFER",
                status="COMPLETED",
            )

        await session.commit()

    async with SessionFactory() as session:
        repository = TransactionRepository(session)
        transactions, total = await repository.list_for_user(
            user_id=source_user_id,
            limit=1,
            offset=0,
        )

    assert total == 3
    assert len(transactions) == 1


@pytest.mark.anyio
async def test_list_for_user_returns_empty_page_when_offset_exceeds_total() -> None:
    """Return an empty page while preserving the total transaction count."""
    source_user_id, source_account = await create_user_with_account(
        "history-offset-source",
    )
    _, destination_account = await create_user_with_account(
        "history-offset-destination",
    )

    async with SessionFactory() as session:
        repository = TransactionRepository(session)
        await repository.create(
            source_account_id=source_account.id,
            destination_account_id=destination_account.id,
            amount=Decimal("12.00"),
            transaction_type="TRANSFER",
            status="COMPLETED",
        )
        await session.commit()

    async with SessionFactory() as session:
        repository = TransactionRepository(session)
        transactions, total = await repository.list_for_user(
            user_id=source_user_id,
            limit=10,
            offset=10,
        )

    assert transactions == []
    assert total == 1


@pytest.mark.anyio
async def test_list_for_user_returns_transactions_newest_first() -> None:
    """Return transactions in descending creation-time and ID order."""
    user_id, source_account = await create_user_with_account(
        "history-order-source",
    )
    _, destination_account = await create_user_with_account(
        "history-order-destination",
    )

    async with SessionFactory() as session:
        repository = TransactionRepository(session)

        first = await repository.create(
            source_account_id=source_account.id,
            destination_account_id=destination_account.id,
            amount=Decimal("10.00"),
            transaction_type="TRANSFER",
            status="COMPLETED",
            reference="First",
        )
        second = await repository.create(
            source_account_id=source_account.id,
            destination_account_id=destination_account.id,
            amount=Decimal("20.00"),
            transaction_type="TRANSFER",
            status="COMPLETED",
            reference="Second",
        )

        first_id = first.id
        second_id = second.id
        await session.commit()

    async with SessionFactory() as session:
        repository = TransactionRepository(session)
        transactions, total = await repository.list_for_user(
            user_id=user_id,
            limit=20,
            offset=0,
        )

    assert total == 2
    assert [transaction.id for transaction, _ in transactions] == [
        second_id,
        first_id,
    ]
