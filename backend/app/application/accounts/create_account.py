from app.application.accounts.ports import AccountRepositoryPort
from app.infrastructure.database.models.account import Account


class CreateAccount:
    """Create financial accounts for authenticated users."""

    def __init__(self, account_repository: AccountRepositoryPort) -> None:
        self.account_repository = account_repository

    async def execute(self, user_id: int) -> Account:
        """Create and return a financial account for a user."""
        return await self.account_repository.create(user_id=user_id)
