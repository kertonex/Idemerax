from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    """Represent the credentials required for user authentication."""

    email: EmailStr
    password: str
