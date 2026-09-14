from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.authentication.authenticate_user import (
    AuthenticateUser,
    AuthenticationError,
)
from app.core.security import create_access_token
from app.infrastructure.database.session import get_session
from app.infrastructure.repositories.user import UserRepository
from app.schemas.authentication import LoginRequest

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/login")
async def login(
    credentials: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Authenticate a user and return an access token."""
    user_repository = UserRepository(session)
    authenticate_user = AuthenticateUser(user_repository)

    try:
        user = await authenticate_user.execute(
            email=credentials.email,
            password=credentials.password,
        )
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        ) from exc

    access_token = create_access_token(str(user.id))

    return {"access_token": access_token, "token_type": "bearer"}  # nosec B105
