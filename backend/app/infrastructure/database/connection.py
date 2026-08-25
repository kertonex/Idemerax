from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.config import settings

DATABASE_URL = (
    "postgresql+psycopg://"
    f"{settings.database_user}:{settings.database_password}"
    f"@{settings.database_host}:{settings.database_port}"
    f"/{settings.database_name}"
)

engine: AsyncEngine = create_async_engine(DATABASE_URL)
