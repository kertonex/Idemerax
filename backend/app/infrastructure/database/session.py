from collections.abc import AsyncGenerator

from fastapi import HTTPException, status
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.infrastructure.database.connection import engine

RETRYABLE_POSTGRES_SQLSTATES = frozenset({"40001", "40P01"})

session_engine = engine.execution_options(
    isolation_level="READ COMMITTED",
)

SessionFactory = async_sessionmaker(
    bind=session_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


def _get_postgres_sqlstate(error: DBAPIError) -> str | None:
    """Extract a PostgreSQL SQLSTATE from a database exception."""
    original_error = error.orig

    sqlstate = getattr(original_error, "sqlstate", None)
    if sqlstate is None:
        sqlstate = getattr(original_error, "pgcode", None)

    if sqlstate is None:
        diagnostic = getattr(original_error, "diag", None)
        sqlstate = getattr(diagnostic, "sqlstate", None)

    return sqlstate


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a READ COMMITTED session with explicit transaction handling."""
    async with SessionFactory() as session:
        try:
            yield session
            if session.in_transaction():
                await session.commit()

        except DBAPIError as exc:
            try:
                await session.rollback()
            except Exception:
                # Preserve the original database exception.
                pass

            if _get_postgres_sqlstate(exc) in RETRYABLE_POSTGRES_SQLSTATES:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=(
                        "A temporary database conflict prevented the "
                        "operation from completing. If retrying a transaction, "
                        "use the same Idempotency-Key."
                    ),
                    headers={"Retry-After": "1"},
                ) from exc

            raise

        except BaseException:
            try:
                await session.rollback()
            except Exception:
                # Preserve the original exception or cancellation.
                pass

            raise
