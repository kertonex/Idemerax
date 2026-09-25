from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.account.iban import generate_account_number, generate_iban
from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.financial_institution import (
    FinancialInstitution,
)


class AccountRepository:
    """Provide database access for accounts."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, user_id: int) -> Account:
        """Create and return a new financial account."""
        institution_result = await self.session.execute(
            select(FinancialInstitution).where(
                FinancialInstitution.name == "Idemerax",
            )
        )
        institution = institution_result.scalar_one()

        for _ in range(10):
            account_number = generate_account_number()

            existing_account = await self.get_by_account_number(
                account_number,
            )

            if existing_account is not None:
                continue

            account = Account(
                user_id=user_id,
                institution_id=institution.id,
                account_number=account_number,
                iban=generate_iban(
                    bank_code=settings.idemerax_bank_code,
                    account_number=account_number,
                ),
            )

            self.session.add(account)
            await self.session.flush()

            return account

        raise RuntimeError("Unable to allocate a unique account number.")

    async def get_by_account_number(
        self,
        account_number: str,
    ) -> Account | None:
        """Return an account matching the account number."""
        result = await self.session.execute(
            select(Account).where(
                Account.account_number == account_number,
            )
        )

        return result.scalar_one_or_none()

    async def get_by_user_id(self, user_id: int) -> Account | None:
        """Return the account belonging to a user."""
        result = await self.session.execute(
            select(Account).where(Account.user_id == user_id)
        )

        return result.scalar_one_or_none()
