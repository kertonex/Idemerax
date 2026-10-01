from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models.financial_institution import (
    FinancialInstitution,
)


class FinancialInstitutionRepository:
    """Provide database access for financial institutions."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_bank_code(
        self,
        bank_code: str,
    ) -> FinancialInstitution | None:
        """Return a financial institution matching the bank code."""
        result = await self.session.execute(
            select(FinancialInstitution).where(
                FinancialInstitution.bank_code == bank_code,
            )
        )

        return result.scalar_one_or_none()
