from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.transaction import Transaction
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
from app.infrastructure.repositories.account import AccountRepository
from app.main import app

client = TestClient(app)


VALID_IBAN = "DE89370400440532013000"
IDEMERAX_IBAN = "DE87123456781234567890"


async def create_user_with_account(
    balance: str = "1000.0000",
) -> tuple[int, Account]:
    """Create a user and financial account for API tests."""
    email = f"transaction-api-{uuid4()}@example.com"

    async with SessionFactory() as session:
        user = User(
            email=email,
            password_hash=hash_password("test-password"),
        )
        session.add(user)
        await session.flush()

        account_repository = AccountRepository(session)
        account = await account_repository.create(user_id=user.id)
        account.balance = Decimal(balance)

        await session.commit()

        return user.id, account


@pytest.mark.anyio
async def test_identify_iban_bank_requires_authentication() -> None:
    """Reject IBAN bank identification without authentication."""
    response = client.get(
        "/transactions/bank-details",
        params={"iban": IDEMERAX_IBAN},
    )

    assert response.status_code == 401


@pytest.mark.anyio
async def test_identify_iban_bank_returns_idemerax_details() -> None:
    """Return Idemerax bank details for a valid Idemerax IBAN."""
    user_id, _ = await create_user_with_account()

    access_token = create_access_token(str(user_id))

    response = client.get(
        "/transactions/bank-details",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"iban": IDEMERAX_IBAN},
    )

    assert response.status_code == 200
    assert response.json() == {
        "bank_code": "12345678",
        "bank_name": "Idemerax",
        "bic": "IDEMDEFFXXX",
    }


@pytest.mark.anyio
async def test_identify_iban_bank_rejects_unknown_bank() -> None:
    """Reject a valid German IBAN that does not belong to Idemerax."""
    user_id, _ = await create_user_with_account()

    access_token = create_access_token(str(user_id))

    response = client.get(
        "/transactions/bank-details",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"iban": "DE89370400440532013000"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "The provided IBAN does not belong to Idemerax."


@pytest.mark.anyio
async def test_create_transaction_requires_authentication() -> None:
    """Reject transaction creation without authentication."""
    response = client.post(
        "/transactions",
        json={
            "destination_iban": VALID_IBAN,
            "amount": "100.00",
        },
    )

    assert response.status_code == 401


@pytest.mark.anyio
async def test_create_transaction_transfers_funds_and_persists_transaction() -> None:
    """Create a transaction and transfer funds between accounts."""
    source_user_id, source_account = await create_user_with_account("1000.0000")
    _, destination_account = await create_user_with_account("250.0000")

    access_token = create_access_token(str(source_user_id))

    response = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "destination_iban": destination_account.iban,
            "amount": "125.5000",
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["id"]
    assert data["source_account_id"] == source_account.id
    assert data["destination_account_id"] == destination_account.id
    assert data["amount"] == "125.5000"
    assert data["transaction_type"] == "TRANSFER"
    assert data["status"] == "COMPLETED"
    assert data["created_at"]

    async with SessionFactory() as session:
        persisted_source = await session.get(Account, source_account.id)
        persisted_destination = await session.get(
            Account,
            destination_account.id,
        )
        persisted_transaction = await session.get(
            Transaction,
            data["id"],
        )

    assert persisted_source is not None
    assert persisted_destination is not None
    assert persisted_transaction is not None

    assert persisted_source.balance == Decimal("874.5000")
    assert persisted_destination.balance == Decimal("375.5000")

    assert persisted_transaction.source_account_id == source_account.id
    assert persisted_transaction.destination_account_id == destination_account.id
    assert persisted_transaction.amount == Decimal("125.5000")
    assert persisted_transaction.transaction_type == "TRANSFER"
    assert persisted_transaction.status == "COMPLETED"
    assert persisted_transaction.created_at is not None


@pytest.mark.anyio
async def test_create_transaction_derives_source_from_authenticated_user() -> None:
    """Use the authenticated user's account as the transaction source."""
    source_user_id, source_account = await create_user_with_account("1000.0000")
    _, destination_account = await create_user_with_account("250.0000")

    access_token = create_access_token(str(source_user_id))

    response = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "destination_iban": destination_account.iban,
            "amount": "100.00",
            "source_account_id": destination_account.id,
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["source_account_id"] == source_account.id
    assert data["destination_account_id"] == destination_account.id

    async with SessionFactory() as session:
        persisted_source = await session.get(Account, source_account.id)
        persisted_destination = await session.get(
            Account,
            destination_account.id,
        )

    assert persisted_source is not None
    assert persisted_destination is not None

    assert persisted_source.balance == Decimal("900.0000")
    assert persisted_destination.balance == Decimal("350.0000")


@pytest.mark.anyio
async def test_create_transaction_normalizes_destination_iban() -> None:
    """Accept destination IBANs with lowercase letters and spaces."""
    source_user_id, source_account = await create_user_with_account("1000.0000")
    _, destination_account = await create_user_with_account("250.0000")

    access_token = create_access_token(str(source_user_id))

    formatted_iban = (
        f"{destination_account.iban[:2].lower()} "
        f"{destination_account.iban[2:6]} "
        f"{destination_account.iban[6:10]} "
        f"{destination_account.iban[10:14]} "
        f"{destination_account.iban[14:18]} "
        f"{destination_account.iban[18:]}"
    )

    response = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "destination_iban": formatted_iban,
            "amount": "100.00",
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["destination_account_id"] == destination_account.id

    async with SessionFactory() as session:
        persisted_source = await session.get(Account, source_account.id)

    assert persisted_source is not None
    assert persisted_source.balance == Decimal("900.0000")


@pytest.mark.anyio
async def test_create_transaction_rejects_invalid_destination_iban() -> None:
    """Reject transactions with an invalid destination IBAN."""
    source_user_id, source_account = await create_user_with_account("1000.0000")

    access_token = create_access_token(str(source_user_id))

    response = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "destination_iban": "DE00000000000000000000",
            "amount": "100.00",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid destination IBAN."

    async with SessionFactory() as session:
        persisted_source = await session.get(Account, source_account.id)

    assert persisted_source is not None
    assert persisted_source.balance == Decimal("1000.0000")


@pytest.mark.anyio
async def test_create_transaction_rejects_same_source_and_destination() -> None:
    """Reject transfers to the authenticated user's own account."""
    source_user_id, source_account = await create_user_with_account("1000.0000")

    access_token = create_access_token(str(source_user_id))

    response = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "destination_iban": source_account.iban,
            "amount": "100.00",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Source and destination accounts must differ."

    async with SessionFactory() as session:
        persisted_source = await session.get(Account, source_account.id)

    assert persisted_source is not None
    assert persisted_source.balance == Decimal("1000.0000")


@pytest.mark.anyio
async def test_create_transaction_rejects_insufficient_funds() -> None:
    """Reject transfers that exceed the source account balance."""
    source_user_id, source_account = await create_user_with_account("50.0000")
    _, destination_account = await create_user_with_account("250.0000")

    access_token = create_access_token(str(source_user_id))

    response = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "destination_iban": destination_account.iban,
            "amount": "100.00",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Insufficient funds."

    async with SessionFactory() as session:
        persisted_source = await session.get(Account, source_account.id)
        persisted_destination = await session.get(
            Account,
            destination_account.id,
        )

    assert persisted_source is not None
    assert persisted_destination is not None

    assert persisted_source.balance == Decimal("50.0000")
    assert persisted_destination.balance == Decimal("250.0000")


@pytest.mark.anyio
@pytest.mark.parametrize(
    "amount",
    [
        "0",
        "-1",
    ],
)
async def test_create_transaction_rejects_non_positive_amount(
    amount: str,
) -> None:
    """Reject zero and negative transaction amounts."""
    user_id, _ = await create_user_with_account()

    access_token = create_access_token(str(user_id))

    response = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "destination_iban": VALID_IBAN,
            "amount": amount,
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_create_transaction_rejects_excessive_precision() -> None:
    """Reject transaction amounts with more than four decimal places."""
    user_id, _ = await create_user_with_account()

    access_token = create_access_token(str(user_id))

    response = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "destination_iban": VALID_IBAN,
            "amount": "100.12345",
        },
    )

    assert response.status_code == 422
