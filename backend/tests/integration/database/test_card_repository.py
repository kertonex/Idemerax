from uuid import uuid4

import pytest

from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import SessionFactory
from app.infrastructure.repositories.account import AccountRepository
from app.infrastructure.repositories.card import CardRepository


@pytest.mark.anyio
async def test_card_repository_scopes_cards_to_account_owner() -> None:
    """A user's card list contains only cards linked to their own accounts."""
    async with SessionFactory() as session:
        first_user = User(
            email=f"card-repository-owner-{uuid4()}@example.com",
            password_hash="test-password-hash",
        )
        second_user = User(
            email=f"card-repository-other-{uuid4()}@example.com",
            password_hash="test-password-hash",
        )
        session.add_all([first_user, second_user])
        await session.flush()
        first_account = await AccountRepository(session).create(first_user.id)
        second_account = await AccountRepository(session).create(second_user.id)
        repository = CardRepository(session)
        first_card = await repository.create(first_account)
        await repository.create(second_account)
        first_user_id = first_user.id
        first_card_id = first_card.id
        await session.commit()

    async with SessionFactory() as session:
        repository = CardRepository(session)
        first_user_cards = await repository.list_for_user(first_user_id)
        foreign_card = await repository.get_by_id_for_user(
            card_id=first_card_id,
            user_id=first_user_id + 999999,
        )

    assert len(first_user_cards) == 1
    assert first_user_cards[0].id == first_card_id
    assert first_user_cards[0].status == "ACTIVE"
    assert first_user_cards[0].card_type == "VIRTUAL_DEBIT"
    assert first_user_cards[0].account is not None
    assert foreign_card is None


@pytest.mark.anyio
async def test_card_repository_persists_status_changes() -> None:
    """Persist a card's new status for the next read."""
    async with SessionFactory() as session:
        user = User(
            email=f"card-status-{uuid4()}@example.com",
            password_hash="test-password-hash",
        )
        session.add(user)
        await session.flush()
        account = await AccountRepository(session).create(user.id)
        repository = CardRepository(session)
        card = await repository.create(account)
        card_id = card.id
        user_id = user.id
        card.status = "INACTIVE"
        await repository.save(card)
        await session.commit()

    async with SessionFactory() as session:
        card = await CardRepository(session).get_by_id_for_user(card_id, user_id)

    assert card is not None
    assert card.status == "INACTIVE"
