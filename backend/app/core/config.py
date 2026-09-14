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

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
