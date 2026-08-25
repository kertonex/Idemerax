from sqlalchemy import Numeric, String

from app.infrastructure.database.base import Base
from app.infrastructure.database.models import Account, Card, Transaction, User


def test_database_models_inherit_from_base() -> None:
    """Verify that all database models inherit from the shared Base."""
    models = (User, Account, Transaction, Card)

    for model in models:
        assert issubclass(model, Base)


def test_database_models_define_expected_tables() -> None:
    """Verify that all database models define their expected tables."""
    assert User.__tablename__ == "users"
    assert Account.__tablename__ == "accounts"
    assert Transaction.__tablename__ == "transactions"
    assert Card.__tablename__ == "cards"


def test_database_models_define_primary_keys() -> None:
    """Verify that all database models define a primary key."""
    models = (User, Account, Transaction, Card)

    for model in models:
        primary_keys = list(model.__table__.primary_key.columns)
        assert len(primary_keys) == 1
        assert primary_keys[0].name == "id"


def test_database_models_define_expected_columns() -> None:
    """Verify that required model columns use the expected SQLAlchemy types."""
    assert isinstance(User.__table__.c.email.type, String)
    assert isinstance(Account.__table__.c.balance.type, Numeric)
    assert isinstance(Transaction.__table__.c.amount.type, Numeric)
    assert isinstance(Card.__table__.c.status.type, String)
