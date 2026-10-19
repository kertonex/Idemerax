from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from app.application.cards.manage_cards import (
    CardLimitExceededError,
    CardManagementError,
    CardNotFoundError,
    FinancialAccountNotFoundError,
    ManageCards,
)
from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.card import Card


@pytest.mark.anyio
async def test_create_card_requires_account_owned_by_user() -> None:
    """Do not create a card when the requested account is not owned by user."""
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    account_repository.get_by_id_for_user.return_value = None
    service = ManageCards(card_repository, account_repository)

    with pytest.raises(FinancialAccountNotFoundError):
        await service.create(user_id=10, account_id=22)

    card_repository.lock_user_for_card_operation.assert_awaited_once_with(10)
    account_repository.get_by_id_for_user.assert_awaited_once_with(
        account_id=22,
        user_id=10,
    )
    card_repository.count_created_for_user_between.assert_not_awaited()
    card_repository.create.assert_not_awaited()


@pytest.mark.anyio
async def test_create_card_uses_the_authenticated_users_account() -> None:
    """Create the card only after account ownership has been confirmed."""
    account = Account(id=22, user_id=10)
    card = Card(
        id=3,
        account_id=22,
        card_type="VIRTUAL_DEBIT",
        status="ACTIVE",
    )

    card_repository = AsyncMock()
    account_repository = AsyncMock()

    account_repository.get_by_id_for_user.return_value = account
    card_repository.create.return_value = card
    card_repository.count_created_for_user_between.return_value = 0
    card_repository.count_active_for_account.return_value = 0

    service = ManageCards(card_repository, account_repository)

    result = await service.create(user_id=10, account_id=22)

    assert result is card

    card_repository.lock_user_for_card_operation.assert_awaited_once_with(10)
    account_repository.get_by_id_for_user.assert_awaited_once_with(
        account_id=22,
        user_id=10,
    )
    assert card_repository.count_created_for_user_between.await_count == 2
    card_repository.count_active_for_account.assert_awaited_once_with(22)
    card_repository.create.assert_awaited_once_with(account)


@pytest.mark.anyio
async def test_create_card_rejects_daily_creation_limit() -> None:
    """Reject card creation when the daily limit has been reached."""
    account = Account(id=22, user_id=10)
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    account_repository.get_by_id_for_user.return_value = account
    card_repository.count_created_for_user_between.return_value = 3

    service = ManageCards(card_repository, account_repository)

    with pytest.raises(
        CardLimitExceededError,
        match="Daily card creation limit reached",
    ):
        await service.create(user_id=10, account_id=22)

    assert card_repository.count_created_for_user_between.await_count == 1
    card_repository.count_active_for_account.assert_not_awaited()
    card_repository.create.assert_not_awaited()


@pytest.mark.anyio
async def test_create_card_rejects_annual_creation_limit() -> None:
    """Reject card creation when the annual limit has been reached."""
    account = Account(id=22, user_id=10)
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    account_repository.get_by_id_for_user.return_value = account

    card_repository.count_created_for_user_between.side_effect = [2, 20]

    service = ManageCards(card_repository, account_repository)

    with pytest.raises(
        CardLimitExceededError,
        match="Annual card creation limit reached",
    ):
        await service.create(user_id=10, account_id=22)

    assert card_repository.count_created_for_user_between.await_count == 2
    card_repository.count_active_for_account.assert_not_awaited()
    card_repository.create.assert_not_awaited()


@pytest.mark.anyio
async def test_create_card_rejects_active_account_limit() -> None:
    """Reject card creation when the account already has three active cards."""
    account = Account(id=22, user_id=10)
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    account_repository.get_by_id_for_user.return_value = account
    card_repository.count_created_for_user_between.return_value = 0
    card_repository.count_active_for_account.return_value = 3

    service = ManageCards(card_repository, account_repository)

    with pytest.raises(
        CardLimitExceededError,
        match="already has 3 active cards",
    ):
        await service.create(user_id=10, account_id=22)

    card_repository.count_active_for_account.assert_awaited_once_with(22)
    card_repository.create.assert_not_awaited()


@pytest.mark.anyio
async def test_list_for_user_returns_repository_results() -> None:
    """Return only the cards supplied by the user-scoped repository."""
    cards = [
        Card(id=1, account_id=22, card_type="VIRTUAL_DEBIT", status="ACTIVE"),
        Card(id=2, account_id=22, card_type="VIRTUAL_DEBIT", status="INACTIVE"),
    ]
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.list_for_user.return_value = cards

    service = ManageCards(card_repository, account_repository)

    result = await service.list_for_user(user_id=10)

    assert result == cards
    card_repository.list_for_user.assert_awaited_once_with(10)


@pytest.mark.anyio
async def test_update_status_rejects_unsupported_status() -> None:
    """Reject status values outside ACTIVE and INACTIVE."""
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    service = ManageCards(card_repository, account_repository)

    with pytest.raises(
        CardManagementError,
        match="Unsupported card status",
    ):
        await service.update_status(
            card_id=5,
            user_id=10,
            new_status="CLOSED",  # type: ignore[arg-type]
        )

    card_repository.lock_user_for_card_operation.assert_not_awaited()
    card_repository.get_by_id_for_user.assert_not_awaited()


@pytest.mark.anyio
async def test_update_status_rejects_card_not_owned_by_user() -> None:
    """Do not change a card that is not visible to the authenticated user."""
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.get_by_id_for_user.return_value = None
    service = ManageCards(card_repository, account_repository)

    with pytest.raises(CardNotFoundError):
        await service.update_status(
            card_id=5,
            user_id=10,
            new_status="INACTIVE",
        )

    card_repository.lock_user_for_card_operation.assert_awaited_once_with(10)
    card_repository.save.assert_not_awaited()


@pytest.mark.anyio
async def test_repeating_current_status_is_idempotent() -> None:
    """Accept repeated requests without writing the card again."""
    card = Card(
        id=5,
        account_id=22,
        card_type="VIRTUAL_DEBIT",
        status="ACTIVE",
    )
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.get_by_id_for_user.return_value = card
    service = ManageCards(card_repository, account_repository)

    result = await service.update_status(
        card_id=5,
        user_id=10,
        new_status="ACTIVE",
    )

    assert result is card
    card_repository.count_active_for_account.assert_not_awaited()
    card_repository.save.assert_not_awaited()


@pytest.mark.anyio
async def test_update_status_rejects_closed_card() -> None:
    """Do not reactivate or modify a permanently closed card."""
    card = Card(
        id=5,
        account_id=22,
        card_type="VIRTUAL_DEBIT",
        status="CLOSED",
    )
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.get_by_id_for_user.return_value = card
    service = ManageCards(card_repository, account_repository)

    with pytest.raises(
        CardManagementError,
        match="closed card cannot be reactivated or changed",
    ):
        await service.update_status(
            card_id=5,
            user_id=10,
            new_status="ACTIVE",
        )

    card_repository.save.assert_not_awaited()
    card_repository.count_active_for_account.assert_not_awaited()


@pytest.mark.anyio
async def test_update_status_rejects_card_with_closed_timestamp() -> None:
    """Reject a card with a closure timestamp even if its status is inconsistent."""
    card = Card(
        id=5,
        account_id=22,
        card_type="VIRTUAL_DEBIT",
        status="INACTIVE",
        closed_at=datetime.now(UTC),
    )
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.get_by_id_for_user.return_value = card
    service = ManageCards(card_repository, account_repository)

    with pytest.raises(
        CardManagementError,
        match="closed card cannot be reactivated or changed",
    ):
        await service.update_status(
            card_id=5,
            user_id=10,
            new_status="ACTIVE",
        )

    card_repository.save.assert_not_awaited()


@pytest.mark.anyio
async def test_update_status_rejects_invalid_persisted_status() -> None:
    """Reject an unexpected status already stored in the database."""
    card = Card(
        id=5,
        account_id=22,
        card_type="VIRTUAL_DEBIT",
        status="BLOCKED",
    )
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.get_by_id_for_user.return_value = card
    service = ManageCards(card_repository, account_repository)

    with pytest.raises(
        CardManagementError,
        match="current card status is invalid",
    ):
        await service.update_status(
            card_id=5,
            user_id=10,
            new_status="ACTIVE",
        )

    card_repository.save.assert_not_awaited()
    card_repository.count_active_for_account.assert_not_awaited()


@pytest.mark.anyio
async def test_update_status_saves_a_valid_transition() -> None:
    """Persist an allowed active-to-inactive transition."""
    card = Card(
        id=5,
        account_id=22,
        card_type="VIRTUAL_DEBIT",
        status="ACTIVE",
    )
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.get_by_id_for_user.return_value = card
    card_repository.save.return_value = card
    service = ManageCards(card_repository, account_repository)

    result = await service.update_status(
        card_id=5,
        user_id=10,
        new_status="INACTIVE",
    )

    assert result.status == "INACTIVE"
    card_repository.save.assert_awaited_once_with(card)
    card_repository.count_active_for_account.assert_not_awaited()


@pytest.mark.anyio
async def test_update_status_rejects_activation_when_account_limit_reached() -> None:
    """Reject activation when the account already has three active cards."""
    card = Card(
        id=5,
        account_id=22,
        card_type="VIRTUAL_DEBIT",
        status="INACTIVE",
    )
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.get_by_id_for_user.return_value = card
    card_repository.count_active_for_account.return_value = 3
    service = ManageCards(card_repository, account_repository)

    with pytest.raises(
        CardLimitExceededError,
        match="already has 3 active cards",
    ):
        await service.update_status(
            card_id=5,
            user_id=10,
            new_status="ACTIVE",
        )

    card_repository.count_active_for_account.assert_awaited_once_with(22)
    card_repository.save.assert_not_awaited()


@pytest.mark.anyio
async def test_update_status_allows_activation_below_account_limit() -> None:
    """Activate an inactive card when the account has room for another card."""
    card = Card(
        id=5,
        account_id=22,
        card_type="VIRTUAL_DEBIT",
        status="INACTIVE",
    )
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.get_by_id_for_user.return_value = card
    card_repository.count_active_for_account.return_value = 2
    card_repository.save.return_value = card
    service = ManageCards(card_repository, account_repository)

    result = await service.update_status(
        card_id=5,
        user_id=10,
        new_status="ACTIVE",
    )

    assert result.status == "ACTIVE"
    card_repository.count_active_for_account.assert_awaited_once_with(22)
    card_repository.save.assert_awaited_once_with(card)


@pytest.mark.anyio
async def test_close_card_rejects_card_not_owned_by_user() -> None:
    """Do not close a card that is not visible to the authenticated user."""
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.get_by_id_for_user.return_value = None
    service = ManageCards(card_repository, account_repository)

    with pytest.raises(CardNotFoundError):
        await service.close_card(card_id=5, user_id=10)

    card_repository.lock_user_for_card_operation.assert_awaited_once_with(10)
    card_repository.save.assert_not_awaited()


@pytest.mark.anyio
async def test_close_card_sets_closed_status_and_timestamp() -> None:
    """Close an owned card and persist its closure timestamp."""
    card = Card(
        id=5,
        account_id=22,
        card_type="VIRTUAL_DEBIT",
        status="ACTIVE",
    )
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.get_by_id_for_user.return_value = card
    card_repository.save.return_value = card
    service = ManageCards(card_repository, account_repository)

    before = datetime.now(UTC)
    result = await service.close_card(card_id=5, user_id=10)
    after = datetime.now(UTC)

    assert result is card
    assert result.status == "CLOSED"
    assert result.closed_at is not None
    assert before <= result.closed_at <= after
    card_repository.save.assert_awaited_once_with(card)


@pytest.mark.anyio
async def test_close_card_is_idempotent_for_already_closed_card() -> None:
    """Return an already closed card without saving it again."""
    closed_at = datetime.now(UTC) - timedelta(days=1)
    card = Card(
        id=5,
        account_id=22,
        card_type="VIRTUAL_DEBIT",
        status="CLOSED",
        closed_at=closed_at,
    )
    card_repository = AsyncMock()
    account_repository = AsyncMock()
    card_repository.get_by_id_for_user.return_value = card
    service = ManageCards(card_repository, account_repository)

    result = await service.close_card(card_id=5, user_id=10)

    assert result is card
    assert result.status == "CLOSED"
    assert result.closed_at == closed_at
    card_repository.save.assert_not_awaited()
