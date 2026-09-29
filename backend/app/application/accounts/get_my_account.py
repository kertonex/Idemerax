from app.application.accounts.ports import AccountRepositoryPort
from app.infrastructure.database.models.account import Account


class GetMyAccount:
    """Retrieve the authenticated user's financial account."""

    def __init__(self, account_repository: AccountRepositoryPort) -> None:
        self.account_repository = account_repository

    async def execute(self, user_id: int) -> Account:
        """Return the financial account belonging to the user."""
        account = await self.account_repository.get_by_user_id(user_id=user_id)

        if account is None:
            raise LookupError("Financial account not found")

        return account
