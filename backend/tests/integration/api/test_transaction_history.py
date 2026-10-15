from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
from app.infrastructure.repositories.account import AccountRepository
from app.infrastructure.repositories.transaction import TransactionRepository
from app.main import app

client = TestClient(app)


async def create_history_user_with_account() -> tuple[int, int]:
    """Create a completed-profile user and return user/account IDs."""
    async with SessionFactory() as session:
        user = User(
            email=f"history-api-{uuid4()}@example.com",
            password_hash=hash_password("test-password"),
            first_name="History",
            last_name="Tester",
        )
        session.add(user)
        await session.flush()

        account_repository = AccountRepository(session)
        account = await account_repository.create(user_id=user.id)

        await session.commit()
        return user.id, account.id


@pytest.mark.anyio
async def test_transaction_history_requires_authentication() -> None:
    """Reject transaction history requests without an access token."""
    response = client.get("/transactions")

    assert response.status_code == 401


@pytest.mark.anyio
async def test_transaction_history_returns_empty_result_for_new_user() -> None:
    """Return an empty paginated history for a user without transactions."""
    user_id, _ = await create_history_user_with_account()
    access_token = create_access_token(str(user_id))

    response = client.get(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "total": 0,
        "limit": 20,
        "offset": 0,
    }


@pytest.mark.anyio
async def test_transaction_history_returns_incoming_and_outgoing_items() -> None:
    """Return owned transactions with correct directions and counterparty data."""
    source_user_id, source_account_id = await create_history_user_with_account()
    (
        destination_user_id,
        destination_account_id,
    ) = await create_history_user_with_account()
    unrelated_user_id, _ = await create_history_user_with_account()

    async with SessionFactory() as session:
        repository = TransactionRepository(session)

        outgoing = await repository.create(
            source_account_id=source_account_id,
            destination_account_id=destination_account_id,
            amount=Decimal("15.00"),
            transaction_type="TRANSFER",
            status="COMPLETED",
            reference="Outgoing history item",
            transfer_method="iban",
        )
        incoming = await repository.create(
            source_account_id=destination_account_id,
            destination_account_id=source_account_id,
            amount=Decimal("22.00"),
            transaction_type="TRANSFER",
            status="COMPLETED",
            reference="Incoming history item",
            transfer_method="email",
        )

        outgoing_id = outgoing.id
        incoming_id = incoming.id
        await session.commit()

    access_token = create_access_token(str(source_user_id))

    response = client.get(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    data = response.json()

    assert data["total"] == 2
    assert data["limit"] == 20
    assert data["offset"] == 0
    assert len(data["items"]) == 2

    items_by_id = {item["id"]: item for item in data["items"]}

    outgoing_item = items_by_id[outgoing_id]
    assert outgoing_item["direction"] == "outgoing"
    assert outgoing_item["reference"] == "Outgoing history item"
    assert outgoing_item["amount"] == "15.0000"
    assert outgoing_item["transaction_type"] == "TRANSFER"
    assert outgoing_item["status"] == "COMPLETED"
    assert outgoing_item["transfer_method"] == "iban"
    assert outgoing_item["counterparty_name"] == "History Tester"
    assert outgoing_item["counterparty_email"].startswith("history-api-")
    assert outgoing_item["counterparty_iban"] is not None

    incoming_item = items_by_id[incoming_id]
    assert incoming_item["direction"] == "incoming"
    assert incoming_item["reference"] == "Incoming history item"
    assert incoming_item["amount"] == "22.0000"
    assert incoming_item["transaction_type"] == "TRANSFER"
    assert incoming_item["status"] == "COMPLETED"
    assert incoming_item["transfer_method"] == "email"
    assert incoming_item["counterparty_name"] == "History Tester"
    assert incoming_item["counterparty_email"].startswith("history-api-")
    assert incoming_item["counterparty_iban"] is not None

    # Both participants should see the transactions involving their accounts.
    other_user_token = create_access_token(str(destination_user_id))
    other_response = client.get(
        "/transactions",
        headers={"Authorization": f"Bearer {other_user_token}"},
    )

    assert other_response.status_code == 200
    assert other_response.json()["total"] == 2

    # An unrelated user must not see transactions involving other accounts.
    unrelated_user_token = create_access_token(str(unrelated_user_id))
    unrelated_response = client.get(
        "/transactions",
        headers={"Authorization": f"Bearer {unrelated_user_token}"},
    )

    assert unrelated_response.status_code == 200
    assert unrelated_response.json() == {
        "items": [],
        "total": 0,
        "limit": 20,
        "offset": 0,
    }


@pytest.mark.anyio
async def test_transaction_history_applies_pagination_parameters() -> None:
    """Honor the requested limit and offset in the response."""
    user_id, account_id = await create_history_user_with_account()
    _, destination_account_id = await create_history_user_with_account()

    async with SessionFactory() as session:
        repository = TransactionRepository(session)

        for amount in ("10.00", "20.00", "30.00"):
            await repository.create(
                source_account_id=account_id,
                destination_account_id=destination_account_id,
                amount=Decimal(amount),
                transaction_type="TRANSFER",
                status="COMPLETED",
            )

        await session.commit()

    access_token = create_access_token(str(user_id))

    response = client.get(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"limit": 1, "offset": 1},
    )

    assert response.status_code == 200
    data = response.json()

    assert data["total"] == 3
    assert data["limit"] == 1
    assert data["offset"] == 1
    assert len(data["items"]) == 1


@pytest.mark.anyio
async def test_transaction_history_accepts_maximum_limit() -> None:
    """Accept the documented maximum page size."""
    user_id, _ = await create_history_user_with_account()
    access_token = create_access_token(str(user_id))

    response = client.get(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"limit": 100, "offset": 0},
    )

    assert response.status_code == 200
    assert response.json()["limit"] == 100


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("params", "invalid_value"),
    [
        ({"limit": 0}, "limit"),
        ({"limit": 101}, "limit"),
        ({"offset": -1}, "offset"),
    ],
)
async def test_transaction_history_rejects_invalid_pagination(
    params: dict[str, int],
    invalid_value: str,
) -> None:
    """Reject pagination values outside the supported bounds."""
    user_id, _ = await create_history_user_with_account()
    access_token = create_access_token(str(user_id))

    response = client.get(
        "/transactions",
        headers={"Authorization": f"Bearer {access_token}"},
        params=params,
    )

    assert response.status_code == 422
    assert any(error["loc"][-1] == invalid_value for error in response.json()["detail"])
