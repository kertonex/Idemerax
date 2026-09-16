from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    """Represent the credentials required for user authentication."""

    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    """Represent the credentials required for user registration."""

    email: EmailStr
    password: str


class AuthenticatedUserResponse(BaseModel):
    """Represent the public data of an authenticated user."""

    id: int
    email: EmailStr
    role: str
    is_active: bool
