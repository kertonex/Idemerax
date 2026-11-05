from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

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


def idempotency_headers(access_token: str) -> dict[str, str]:
    """Build authenticated headers with a unique idempotency key."""
    return {
        "Authorization": f"Bearer {access_token}",
        "Idempotency-Key": f"test-transaction-{uuid4()}",
    }


async def create_user_with_account(
    balance: str = "1000.0000",
) -> tuple[int, Account]:
    """Create a user and financial account for API tests."""
    email = f"transaction-api-{uuid4()}@example.com"

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
        params={"iban": VALID_IBAN},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "The provided IBAN does not belong to Idemerax."
    )


@pytest.mark.anyio
async def test_create_transaction_requires_authentication() -> None:
    """Reject transaction creation without authentication."""
    response = client.post(
        "/transactions",
        headers={"Idempotency-Key": f"unauthenticated-{uuid4()}"},
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
        headers=idempotency_headers(access_token),
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
        headers=idempotency_headers(access_token),
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
        headers=idempotency_headers(access_token),
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
        headers=idempotency_headers(access_token),
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
        headers=idempotency_headers(access_token),
        json={
            "destination_iban": source_account.iban,
            "amount": "100.00",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == ("Source and destination accounts must differ.")

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
        headers=idempotency_headers(access_token),
        json={
            "destination_iban": destination_account.iban,
            "amount": "100.00",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Transfer failed: INSUFFICIENT_FUNDS"

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
        headers=idempotency_headers(access_token),
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
        headers=idempotency_headers(access_token),
        json={
            "destination_iban": VALID_IBAN,
            "amount": "100.12345",
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_create_transaction_rejects_incomplete_profile() -> None:
    """Reject transaction access until required profile information is completed."""
    email = f"transaction-incomplete-{uuid4()}@example.com"

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
        "/transactions",
        headers=idempotency_headers(access_token),
        json={
            "destination_iban": VALID_IBAN,
            "amount": "100.00",
        },
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Profile completion is required.",
    }


@pytest.mark.anyio
async def test_replays_same_key_without_duplicate_side_effects() -> None:
    """Replay an equivalent request without transferring funds twice."""
    source_user_id, source_account = await create_user_with_account("1000.0000")
    _, destination_account = await create_user_with_account("250.0000")

    access_token = create_access_token(str(source_user_id))

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Idempotency-Key": f"transaction-replay-{uuid4()}",
    }

    payload = {
        "destination_iban": destination_account.iban,
        "amount": "100.00",
        "reference": "Replay-safe transfer",
    }

    first_response = client.post(
        "/transactions",
        headers=headers,
        json=payload,
    )

    replay_response = client.post(
        "/transactions",
        headers=headers,
        json=payload,
    )

    assert first_response.status_code == 201
    assert replay_response.status_code == 200
    assert replay_response.json()["id"] == first_response.json()["id"]

    async with SessionFactory() as session:
        persisted_source = await session.get(Account, source_account.id)
        persisted_destination = await session.get(
            Account,
            destination_account.id,
        )

        result = await session.execute(
            select(Transaction).where(
                Transaction.source_account_id == source_account.id,
                Transaction.idempotency_key == headers["Idempotency-Key"],
            )
        )

        persisted_transactions = list(result.scalars().all())

    assert persisted_source is not None
    assert persisted_destination is not None

    assert persisted_source.balance == Decimal("900.0000")
    assert persisted_destination.balance == Decimal("350.0000")

    assert len(persisted_transactions) == 1
    assert persisted_transactions[0].id == first_response.json()["id"]
    assert persisted_transactions[0].request_fingerprint is not None


@pytest.mark.anyio
async def test_create_transaction_rejects_same_key_with_different_payload() -> None:
    """Reject changed transfer intent without applying another transfer."""
    source_user_id, source_account = await create_user_with_account("1000.0000")
    _, destination_account = await create_user_with_account("250.0000")

    access_token = create_access_token(str(source_user_id))

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Idempotency-Key": f"transaction-conflict-{uuid4()}",
    }

    original_payload = {
        "destination_iban": destination_account.iban,
        "amount": "100.00",
        "reference": "Original transfer",
    }

    changed_payload = {
        **original_payload,
        "amount": "150.00",
    }

    first_response = client.post(
        "/transactions",
        headers=headers,
        json=original_payload,
    )

    conflict_response = client.post(
        "/transactions",
        headers=headers,
        json=changed_payload,
    )

    assert first_response.status_code == 201
    assert conflict_response.status_code == 409

    async with SessionFactory() as session:
        persisted_source = await session.get(Account, source_account.id)
        persisted_destination = await session.get(
            Account,
            destination_account.id,
        )

        result = await session.execute(
            select(Transaction).where(
                Transaction.source_account_id == source_account.id,
                Transaction.idempotency_key == headers["Idempotency-Key"],
            )
        )

        persisted_transactions = list(result.scalars().all())

    assert persisted_source is not None
    assert persisted_destination is not None

    assert persisted_source.balance == Decimal("900.0000")
    assert persisted_destination.balance == Decimal("350.0000")

    assert len(persisted_transactions) == 1
    assert persisted_transactions[0].id == first_response.json()["id"]


@pytest.mark.anyio
async def test_concurrent_identical_requests_create_one_transaction() -> None:
    """Return one persisted result for simultaneous identical requests."""
    source_user_id, source_account = await create_user_with_account("1000.0000")
    _, destination_account = await create_user_with_account("250.0000")

    access_token = create_access_token(str(source_user_id))

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Idempotency-Key": f"transaction-concurrent-{uuid4()}",
    }

    payload = {
        "destination_iban": destination_account.iban,
        "amount": "125.00",
        "reference": "Concurrent duplicate request",
    }

    def send_request(_index: int):
        return client.post(
            "/transactions",
            headers=headers,
            json=payload,
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(send_request, range(2)))

    assert sorted(response.status_code for response in responses) == [
        200,
        201,
    ]

    transaction_ids = {response.json()["id"] for response in responses}

    assert len(transaction_ids) == 1

    async with SessionFactory() as session:
        persisted_source = await session.get(Account, source_account.id)
        persisted_destination = await session.get(
            Account,
            destination_account.id,
        )

        result = await session.execute(
            select(Transaction).where(
                Transaction.source_account_id == source_account.id,
                Transaction.idempotency_key == headers["Idempotency-Key"],
            )
        )

        persisted_transactions = list(result.scalars().all())

    assert persisted_source is not None
    assert persisted_destination is not None

    assert persisted_source.balance == Decimal("875.0000")
    assert persisted_destination.balance == Decimal("375.0000")

    assert len(persisted_transactions) == 1
    assert persisted_transactions[0].id in transaction_ids


@pytest.mark.anyio
@pytest.mark.parametrize(
    "idempotency_key",
    [
        None,
        "",
        "invalid/key",
        "x" * 129,
    ],
)
async def test_create_transaction_requires_a_valid_idempotency_key(
    idempotency_key: str | None,
) -> None:
    """Reject missing or malformed idempotency keys."""
    user_id, _ = await create_user_with_account()

    headers = {
        "Authorization": f"Bearer {create_access_token(str(user_id))}",
    }

    if idempotency_key is not None:
        headers["Idempotency-Key"] = idempotency_key

    response = client.post(
        "/transactions",
        headers=headers,
        json={
            "destination_iban": IDEMERAX_IBAN,
            "amount": "100.00",
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_same_idempotency_key_is_isolated_between_users() -> None:
    """Do not replay another user's transaction when keys are equal."""
    first_user_id, first_source_account = await create_user_with_account(
        "1000.0000",
    )

    second_user_id, second_source_account = await create_user_with_account(
        "1000.0000",
    )

    _, destination_account = await create_user_with_account("250.0000")

    idempotency_key = f"user-scope-{uuid4()}"

    payload = {
        "destination_iban": destination_account.iban,
        "amount": "100.00",
        "reference": "User-scoped idempotency",
    }

    first_response = client.post(
        "/transactions",
        headers={
            "Authorization": f"Bearer {create_access_token(str(first_user_id))}",
            "Idempotency-Key": idempotency_key,
        },
        json=payload,
    )

    second_response = client.post(
        "/transactions",
        headers={
            "Authorization": f"Bearer {create_access_token(str(second_user_id))}",
            "Idempotency-Key": idempotency_key,
        },
        json=payload,
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201

    first_transaction_id = first_response.json()["id"]
    second_transaction_id = second_response.json()["id"]

    assert first_transaction_id != second_transaction_id

    async with SessionFactory() as session:
        first_source = await session.get(Account, first_source_account.id)
        second_source = await session.get(Account, second_source_account.id)

        result = await session.execute(
            select(Transaction).where(
                Transaction.idempotency_key == idempotency_key,
            )
        )

        persisted_transactions = list(result.scalars().all())

    assert first_source is not None
    assert second_source is not None

    assert first_source.balance == Decimal("900.0000")
    assert second_source.balance == Decimal("900.0000")

    assert {transaction.id for transaction in persisted_transactions} == {
        first_transaction_id,
        second_transaction_id,
    }


@pytest.mark.anyio
async def test_concurrent_conflicting_payloads_only_process_one_request() -> None:
    """Conflicting concurrent requests with the same key cannot double-transfer."""
    source_user_id, source_account = await create_user_with_account("1000.0000")
    _, destination_account = await create_user_with_account("250.0000")
    access_token = create_access_token(str(source_user_id))
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Idempotency-Key": f"transaction-conflicting-concurrent-{uuid4()}",
    }
    payloads = [
        {
            "destination_iban": destination_account.iban,
            "amount": "125.00",
            "reference": "intent A",
        },
        {
            "destination_iban": destination_account.iban,
            "amount": "200.00",
            "reference": "intent B",
        },
    ]

    def send_request(payload: dict[str, str]):
        return client.post("/transactions", headers=headers, json=payload)

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(send_request, payloads))

    assert sorted(response.status_code for response in responses) == [201, 409]
    successful_response = next(
        response for response in responses if response.status_code == 201
    )
    successful_amount = Decimal(successful_response.json()["amount"])

    async with SessionFactory() as session:
        persisted_source = await session.get(Account, source_account.id)
        persisted_destination = await session.get(Account, destination_account.id)
        result = await session.execute(
            select(Transaction).where(
                Transaction.source_account_id == source_account.id,
                Transaction.idempotency_key == headers["Idempotency-Key"],
            )
        )
        persisted_transactions = list(result.scalars().all())

    assert persisted_source is not None
    assert persisted_destination is not None
    assert persisted_source.balance == Decimal("1000.0000") - successful_amount
    assert persisted_destination.balance == Decimal("250.0000") + successful_amount
    assert len(persisted_transactions) == 1
    assert persisted_transactions[0].amount == successful_amount
