from sqlalchemy.orm import DeclarativeBase

from app.infrastructure.database.base import Base


def test_base_is_declarative_base() -> None:
    """Verify that Base inherits from SQLAlchemy's DeclarativeBase."""
    assert issubclass(Base, DeclarativeBase)
