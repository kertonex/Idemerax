from app.application.authentication.ports import UserRepositoryPort
from app.core.security import hash_password
from app.infrastructure.database.models.user import User


class RegistrationError(Exception):
    """Raise when user registration fails."""


class RegisterUser:
    """Register new users with email and password."""

    def __init__(self, user_repository: UserRepositoryPort) -> None:
        self.user_repository = user_repository

    async def execute(
        self,
        email: str,
        password: str,
    ) -> User:
        """Register a new user and return the created user."""
        existing_user = await self.user_repository.get_by_email(email)

        if existing_user is not None:
            raise RegistrationError(
                "Email address is already registered.",
            )

        password_hash = hash_password(password)

        return await self.user_repository.create(
            email=email,
            password_hash=password_hash,
        )
