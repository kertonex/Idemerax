from unittest.mock import AsyncMock, Mock

import pytest

from app.application.accounts.create_account import CreateAccount
from app.infrastructure.database.models.account import Account


@pytest.mark.anyio
async def test_create_account_creates_account_for_user() -> None:
    """Create a financial account for the given user."""
    account = Account(
        id=1,
        user_id=42,
        institution_id=1,
        account_number="1234567890",
        iban="DE00123456781234567890",
    )

    account_repository = Mock()
    account_repository.create = AsyncMock(return_value=account)

    create_account = CreateAccount(account_repository)

    result = await create_account.execute(user_id=42)

    account_repository.create.assert_awaited_once_with(
        user_id=42,
    )
    assert result is account
