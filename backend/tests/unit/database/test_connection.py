from sqlalchemy.ext.asyncio import AsyncEngine

from app.infrastructure.database.connection import engine


def test_database_engine_is_async_engine() -> None:
    """Verify that the database engine uses SQLAlchemy's async engine."""
    assert isinstance(engine, AsyncEngine)


def test_database_engine_uses_postgresql() -> None:
    """Verify that the database engine uses the PostgreSQL dialect."""
    assert engine.dialect.name == "postgresql"
