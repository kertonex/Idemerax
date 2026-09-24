import pytest

from app.application.accounts.get_my_account import GetMyAccount
from app.infrastructure.database.models.account import Account


class FakeAccountRepository:
    def __init__(self, account: Account | None) -> None:
        self.account = account
        self.user_id: int | None = None

    async def create(self, user_id: int) -> Account:
        raise NotImplementedError

    async def get_by_user_id(self, user_id: int) -> Account | None:
        self.user_id = user_id
        return self.account


@pytest.mark.anyio
async def test_get_my_account_returns_account() -> None:
    account = Account(id=1, user_id=42)
    repository = FakeAccountRepository(account)
    use_case = GetMyAccount(repository)

    result = await use_case.execute(user_id=42)

    assert result is account
    assert repository.user_id == 42


@pytest.mark.anyio
async def test_get_my_account_raises_when_account_not_found() -> None:
    repository = FakeAccountRepository(None)
    use_case = GetMyAccount(repository)

    with pytest.raises(
        LookupError,
        match="Financial account not found",
    ):
        await use_case.execute(user_id=42)

    assert repository.user_id == 42
