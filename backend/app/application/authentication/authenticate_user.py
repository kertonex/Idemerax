from app.application.authentication.ports import UserRepositoryPort
from app.core.security import verify_password
from app.infrastructure.database.models.user import User


class AuthenticationError(Exception):
    """Raise when user authentication fails."""


class AuthenticateUser:
    """Authenticate users with email and password."""

    def __init__(self, user_repository: UserRepositoryPort) -> None:
        self.user_repository = user_repository

    async def execute(
        self,
        email: str,
        password: str,
    ) -> User:
        """Authenticate a user and return the authenticated user."""
        user = await self.user_repository.get_by_email(email)

        if user is None or user.password_hash is None or not user.is_active:
            raise AuthenticationError("Invalid credentials.")

        if not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid credentials.")

        return user
