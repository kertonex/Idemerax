from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.application.authentication.authenticate_user import (
    AuthenticateUser,
    AuthenticationError,
)
from app.core.security import create_access_token
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import get_session
from app.infrastructure.repositories.user import UserRepository
from app.schemas.authentication import (
    AuthenticatedUserResponse,
    LoginRequest,
)

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


@router.get("/me", response_model=AuthenticatedUserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
) -> AuthenticatedUserResponse:
    """Return the currently authenticated user."""
    return AuthenticatedUserResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
    )
