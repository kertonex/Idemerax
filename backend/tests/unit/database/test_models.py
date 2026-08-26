from sqlalchemy import Numeric, String
from sqlalchemy.orm import RelationshipProperty

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
        primary_keys = list(model.__table__.primary_key)
        assert len(primary_keys) == 1
        assert primary_keys[0].name == "id"



def test_database_models_define_expected_columns() -> None:
    """Verify that required model columns use the expected SQLAlchemy types."""
    assert isinstance(User.__table__.c.email.type, String)
    assert isinstance(Account.__table__.c.balance.type, Numeric)
    assert isinstance(Transaction.__table__.c.amount.type, Numeric)
    assert isinstance(Card.__table__.c.status.type, String)


def test_user_email_is_unique() -> None:
    """Verify that user email addresses are unique."""
    email_column = User.__table__.c.email

    assert email_column.unique is True


def test_account_user_id_has_foreign_key() -> None:
    """Verify that account user_id references the users table."""
    user_id_column = Account.__table__.c.user_id
    foreign_keys = list(user_id_column.foreign_keys)

    assert len(foreign_keys) == 1
    assert foreign_keys[0].target_fullname == "users.id"


def test_user_account_relationships_are_defined() -> None:
    """Verify that the User-Account ORM relationships are configured."""
    user_relationship = User.__mapper__.relationships["accounts"]
    account_relationship = Account.__mapper__.relationships["user"]

    assert isinstance(user_relationship, RelationshipProperty)
    assert isinstance(account_relationship, RelationshipProperty)

    assert user_relationship.mapper.class_ is Account
    assert account_relationship.mapper.class_ is User

    assert user_relationship.back_populates == "user"
    assert account_relationship.back_populates == "accounts"


def test_account_user_id_is_indexed() -> None:
    """Verify that the account user_id column has a database index."""
    user_id_column = Account.__table__.c.user_id

    assert user_id_column.index is True
