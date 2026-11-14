from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    database_host: str
    database_port: int
    database_name: str
    database_user: str
    database_password: str

    jwt_private_key_path: str
    jwt_public_key_path: str
    jwt_algorithm: str = "RS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_issuer: str = "idemerax"
    jwt_audience: str = "idemerax-api"
    refresh_session_expire_days: int = 30

    idemerax_bank_code: str
    cors_allowed_origins: str = "http://localhost:5173,http://localhost"

    @property
    def allowed_origins(self) -> list[str]:
        """Return the configured browser origins without empty entries."""
        return [
            origin.strip()
            for origin in self.cors_allowed_origins.split(",")
            if origin.strip()
        ]

    model_config = SettingsConfigDict(env_file=".env")


# Pydantic Settings loads required values from environment variables and .env.
settings = Settings()  # pyright: ignore[reportCallIssue]
