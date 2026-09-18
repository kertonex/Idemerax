from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    """Represent the credentials required for user authentication."""

    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=15, max_length=128)


class RegisterRequest(BaseModel):
    """Represent the credentials required for user registration."""

    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=15, max_length=128)


class AuthenticatedUserResponse(BaseModel):
    """Represent the public data of an authenticated user."""

    id: int
    email: EmailStr
    role: str
    is_active: bool
