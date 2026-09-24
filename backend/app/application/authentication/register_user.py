from app.application.authentication.ports import (
    AccountRepositoryPort,
    UserRepositoryPort,
)
from app.core.security import hash_password
from app.infrastructure.database.models.user import User


class RegistrationError(Exception):
    """Raise when user registration fails."""


class RegisterUser:
    """Register users and create their initial financial account."""

    def __init__(
        self,
        user_repository: UserRepositoryPort,
        account_repository: AccountRepositoryPort,
    ) -> None:
        self.user_repository = user_repository
        self.account_repository = account_repository

    async def execute(
        self,
        email: str,
        password: str,
    ) -> User:
        """Register a user and create their initial financial account."""
        existing_user = await self.user_repository.get_by_email(email)

        if existing_user is not None:
            raise RegistrationError(
                "Email address is already registered.",
            )

        password_hash = hash_password(password)

        user = await self.user_repository.create(
            email=email,
            password_hash=password_hash,
        )

        await self.account_repository.create(
            user_id=user.id,
        )

        return user
