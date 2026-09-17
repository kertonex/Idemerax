from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from psycopg.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.application.authentication.authenticate_user import (
    AuthenticateUser,
    AuthenticationError,
)
from app.application.authentication.register_user import (
    RegisterUser,
    RegistrationError,
)
from app.application.authentication.renew_access_token import (
    RefreshSessionError,
    RenewAccessToken,
)
from app.application.authentication.revoke_refresh_session import (
    RefreshSessionRevocationError,
    RevokeRefreshSession,
)
from app.core.security import create_access_token
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import get_session
from app.infrastructure.repositories.refresh_session import (
    RefreshSessionRepository,
)
from app.infrastructure.repositories.user import UserRepository
from app.schemas.authentication import (
    AuthenticatedUserResponse,
    LoginRequest,
    RegisterRequest,
)

router = APIRouter(prefix="/auth", tags=["authentication"])

REFRESH_TOKEN_COOKIE = "__Host-refresh_token"  # nosec B105


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


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    credentials: RegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Register a new user and return an access token."""
    user_repository = UserRepository(session)
    register_user = RegisterUser(user_repository)

    try:
        user = await register_user.execute(
            email=credentials.email,
            password=credentials.password,
        )
    except RegistrationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address is already registered.",
        ) from exc
    except IntegrityError as exc:
        await session.rollback()

        if isinstance(exc.orig, UniqueViolation):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email address is already registered.",
            ) from exc

        raise

    access_token = create_access_token(str(user.id))

    return {"access_token": access_token, "token_type": "bearer"}  # nosec B105


@router.post("/refresh")
async def refresh_access_token(
    response: Response,
    refresh_token: str | None = Cookie(
        default=None,
        alias=REFRESH_TOKEN_COOKIE,
    ),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Renew an access token and rotate the refresh token."""
    if refresh_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh session.",
        )

    refresh_session_repository = RefreshSessionRepository(session)
    user_repository = UserRepository(session)

    renew_access_token = RenewAccessToken(
        refresh_session_repository=refresh_session_repository,
        user_repository=user_repository,
    )

    try:
        access_token, new_refresh_token = await renew_access_token.execute(
            refresh_token,
        )
    except RefreshSessionError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh session.",
        ) from exc

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=new_refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }  # nosec B105


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(
        default=None,
        alias=REFRESH_TOKEN_COOKIE,
    ),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Revoke the refresh session and clear the refresh token cookie."""
    if refresh_token is not None:
        refresh_session_repository = RefreshSessionRepository(session)
        revoke_refresh_session = RevokeRefreshSession(
            refresh_session_repository,
        )

        try:
            await revoke_refresh_session.execute(refresh_token)
        except RefreshSessionRevocationError:
            pass

    response.delete_cookie(
        key=REFRESH_TOKEN_COOKIE,
    )


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
