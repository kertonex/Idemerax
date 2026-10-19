from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

import app.api.routes.cards as cards_route
from app.application.cards.manage_cards import (
    CardManagementError,
    CardNotFoundError,
)
from app.core.security import create_access_token
from app.infrastructure.database.models.card import Card
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
from app.infrastructure.repositories.account import AccountRepository
from app.main import app
from app.schemas.card import CardCreateRequest, CardStatusUpdateRequest

client = TestClient(app)


async def create_user_with_account(first_name: str = "Card") -> tuple[int, int]:
    """Create a profile-complete user and their financial account."""
    async with SessionFactory() as session:
        user = User(
            email=f"cards-{uuid4()}@example.com",
            password_hash="test-password-hash",
            first_name=first_name,
            last_name="Tester",
        )
        session.add(user)
        await session.flush()
        account = await AccountRepository(session).create(user_id=user.id)
        await session.commit()
        return user.id, account.id


def create_card_response_fixture(status: str = "ACTIVE") -> SimpleNamespace:
    """Build a card with the relationships required by the API response."""
    institution = SimpleNamespace(bic="IDEMDEFFXXX")
    account = SimpleNamespace(
        id=10,
        account_number="1234567890",
        iban="DE89370400440532013000",
        institution=institution,
        balance=Decimal("100.00"),
    )

    return SimpleNamespace(
        id=20,
        account_id=account.id,
        last_four="1234",
        status=status,
        created_at=datetime(2026, 10, 19, tzinfo=UTC),
        closed_at=(datetime(2026, 10, 19, tzinfo=UTC) if status == "CLOSED" else None),
        account=account,
    )


@pytest.mark.anyio
async def test_card_endpoints_require_authentication() -> None:
    """Protect card list, create, status update, and close endpoints."""
    assert client.get("/cards").status_code == 401
    assert client.post("/cards", json={"account_id": 1}).status_code == 401
    assert (
        client.patch("/cards/1/status", json={"status": "INACTIVE"}).status_code == 401
    )
    assert client.post("/cards/1/close").status_code == 401


@pytest.mark.anyio
async def test_user_can_create_and_list_virtual_demo_card() -> None:
    """Create a masked virtual debit card linked to the user's account."""
    user_id, account_id = await create_user_with_account()
    token = create_access_token(str(user_id))

    response = client.post(
        "/cards",
        headers={"Authorization": f"Bearer {token}"},
        json={"account_id": account_id},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["account_id"] == account_id
    assert data["card_type"] == "VIRTUAL_DEBIT"
    assert data["status"] == "ACTIVE"
    assert len(data["last_four"]) == 4
    assert data["last_four"].isdigit()
    assert data["account"]["id"] == account_id
    assert data["account"]["iban"].startswith("DE")
    assert "card_number" not in data
    assert "cvv" not in data

    list_response = client.get(
        "/cards",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["id"] == data["id"]

    async with SessionFactory() as session:
        persisted = await session.get(Card, data["id"])

    assert persisted is not None
    assert persisted.account_id == account_id
    assert persisted.card_type == "VIRTUAL_DEBIT"


@pytest.mark.anyio
async def test_user_cannot_create_card_for_another_users_account() -> None:
    """Reject a foreign account without revealing whether it exists."""
    first_user_id, _ = await create_user_with_account()
    _, other_account_id = await create_user_with_account()
    token = create_access_token(str(first_user_id))

    response = client.post(
        "/cards",
        headers={"Authorization": f"Bearer {token}"},
        json={"account_id": other_account_id},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Financial account not found."


@pytest.mark.anyio
async def test_user_cannot_view_or_update_another_users_card() -> None:
    """Scope card reads and status updates to the card owner's account."""
    owner_id, account_id = await create_user_with_account()
    other_user_id, _ = await create_user_with_account()
    owner_token = create_access_token(str(owner_id))
    other_token = create_access_token(str(other_user_id))

    created = client.post(
        "/cards",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"account_id": account_id},
    )

    assert created.status_code == 201
    card_id = created.json()["id"]

    other_list = client.get(
        "/cards",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    other_update = client.patch(
        f"/cards/{card_id}/status",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"status": "INACTIVE"},
    )

    assert other_list.status_code == 200
    assert other_list.json() == []
    assert other_update.status_code == 404

    owner_update = client.patch(
        f"/cards/{card_id}/status",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"status": "INACTIVE"},
    )

    assert owner_update.status_code == 200
    assert owner_update.json()["status"] == "INACTIVE"


@pytest.mark.anyio
async def test_card_creation_rejects_client_controlled_card_fields() -> None:
    """Prevent clients from choosing card status or type during creation."""
    user_id, account_id = await create_user_with_account()
    token = create_access_token(str(user_id))

    response = client.post(
        "/cards",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "account_id": account_id,
            "status": "ACTIVE",
            "card_type": "CREDIT",
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_card_status_endpoint_rejects_unsupported_status() -> None:
    """Reject status values outside the card lifecycle."""
    user_id, _ = await create_user_with_account()
    token = create_access_token(str(user_id))

    response = client.patch(
        "/cards/1/status",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "BLOCKED"},
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("ACTIVE", "ACTIVE"),
        ("INACTIVE", "INACTIVE"),
        ("CLOSED", "CLOSED"),
    ],
)
def test_validated_status_accepts_supported_values(
    value: str,
    expected: str,
) -> None:
    """Accept every supported persisted card status."""
    assert cards_route._validated_status(value) == expected


def test_validated_status_rejects_unknown_value() -> None:
    """Reject a persisted status that the API does not support."""
    with pytest.raises(
        RuntimeError,
        match="Unexpected persisted card status",
    ):
        cards_route._validated_status("BLOCKED")


@pytest.mark.anyio
async def test_create_card_maps_general_management_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Map card creation conflicts to HTTP 409."""
    service = SimpleNamespace(
        create=AsyncMock(
            side_effect=CardManagementError("Card limit reached."),
        ),
    )
    monkeypatch.setattr(cards_route, "_get_service", lambda session: service)

    with pytest.raises(HTTPException) as exc_info:
        await cards_route.create_card(
            request=CardCreateRequest(account_id=10),
            current_user=cast(User, SimpleNamespace(id=1)),
            session=cast(AsyncSession, SimpleNamespace()),
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Card limit reached."


@pytest.mark.anyio
async def test_update_card_status_maps_card_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Map a missing or foreign-owned card to HTTP 404."""
    service = SimpleNamespace(
        update_status=AsyncMock(
            side_effect=CardNotFoundError("Card not found."),
        ),
    )
    monkeypatch.setattr(cards_route, "_get_service", lambda session: service)

    with pytest.raises(HTTPException) as exc_info:
        await cards_route.update_card_status(
            card_id=20,
            request=CardStatusUpdateRequest(status="INACTIVE"),
            current_user=cast(User, SimpleNamespace(id=1)),
            session=cast(AsyncSession, SimpleNamespace()),
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Card not found."


@pytest.mark.anyio
async def test_update_card_status_maps_management_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Map card status conflicts to HTTP 409."""
    service = SimpleNamespace(
        update_status=AsyncMock(
            side_effect=CardManagementError("Card cannot be updated."),
        ),
    )
    monkeypatch.setattr(cards_route, "_get_service", lambda session: service)

    with pytest.raises(HTTPException) as exc_info:
        await cards_route.update_card_status(
            card_id=20,
            request=CardStatusUpdateRequest(status="INACTIVE"),
            current_user=cast(User, SimpleNamespace(id=1)),
            session=cast(AsyncSession, SimpleNamespace()),
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Card cannot be updated."


@pytest.mark.anyio
async def test_close_card_returns_closed_card(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Return the response for a permanently closed card."""
    card = create_card_response_fixture(status="CLOSED")
    service = SimpleNamespace(close_card=AsyncMock(return_value=card))
    monkeypatch.setattr(cards_route, "_get_service", lambda session: service)

    response = await cards_route.close_card(
        card_id=20,
        current_user=cast(User, SimpleNamespace(id=1)),
        session=cast(AsyncSession, SimpleNamespace()),
    )

    assert response.id == 20
    assert response.status == "CLOSED"
    assert response.closed_at == card.closed_at
    service.close_card.assert_awaited_once_with(card_id=20, user_id=1)


@pytest.mark.anyio
async def test_close_card_maps_card_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Map a missing or foreign-owned card to HTTP 404."""
    service = SimpleNamespace(
        close_card=AsyncMock(
            side_effect=CardNotFoundError("Card not found."),
        ),
    )
    monkeypatch.setattr(cards_route, "_get_service", lambda session: service)

    with pytest.raises(HTTPException) as exc_info:
        await cards_route.close_card(
            card_id=20,
            current_user=cast(User, SimpleNamespace(id=1)),
            session=cast(AsyncSession, SimpleNamespace()),
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Card not found."


@pytest.mark.anyio
async def test_close_card_maps_management_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Map card lifecycle conflicts to HTTP 409."""
    service = SimpleNamespace(
        close_card=AsyncMock(
            side_effect=CardManagementError("Card is already closed."),
        ),
    )
    monkeypatch.setattr(cards_route, "_get_service", lambda session: service)

    with pytest.raises(HTTPException) as exc_info:
        await cards_route.close_card(
            card_id=20,
            current_user=cast(User, SimpleNamespace(id=1)),
            session=cast(AsyncSession, SimpleNamespace()),
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Card is already closed."
