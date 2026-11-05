import asyncio
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Path,
    Query,
    Response,
    status,
)
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_completed_current_user
from app.application.accounts.identify_iban_bank import (
    IbanBankIdentificationError,
    identify_iban_bank,
)
from app.application.transactions.process_transaction import (
    TransactionProcessing,
    TransactionProcessingError,
)
from app.application.transactions.recover_transaction import (
    RecoverTransaction,
    RecoveryConflictError,
    RecoveryNotFoundError,
)
from app.infrastructure.database.models.transaction import Transaction
from app.infrastructure.database.models.transaction_recovery import TransactionRecovery
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import get_session
from app.infrastructure.repositories.account import AccountRepository
from app.infrastructure.repositories.financial_institution import (
    FinancialInstitutionRepository,
)
from app.infrastructure.repositories.transaction import (
    IdempotencyPersistenceConflictError,
    TransactionRepository,
)
from app.schemas.transaction import (
    IbanBankIdentificationResponse,
    TransactionCreateRequest,
    TransactionHistoryItem,
    TransactionHistoryResponse,
    TransactionResponse,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])

TransferMethod = Literal["iban", "email"]
TransactionDirection = Literal["incoming", "outgoing"]

RETRYABLE_POSTGRES_SQLSTATES = frozenset({"40001", "40P01"})
MAX_TRANSACTION_ATTEMPTS = 2
TRANSACTION_RETRY_DELAY_SECONDS = 0.05


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


def _is_retryable_transaction_error(error: DBAPIError) -> bool:
    """Identify PostgreSQL errors that can justify retrying a transaction."""
    return _get_postgres_sqlstate(error) in RETRYABLE_POSTGRES_SQLSTATES


async def _rollback_safely(session: AsyncSession) -> None:
    """Attempt rollback without hiding the original application error."""
    try:
        await session.rollback()
    except Exception:  # nosec B110 - preserve the original exception.
        pass


async def _resume_transaction_with_retry(
    *,
    service: RecoverTransaction,
    session: AsyncSession,
    user_id: int,
    idempotency_key: str,
) -> tuple[str, TransactionRecovery, Transaction | None]:
    """Retry a durable recovery operation after recognized transient conflicts.

    The reservation is committed before this helper is called. Repeating the
    same resume operation is safe: its recovery row is locked and the transfer,
    transaction record, and completed state are committed atomically.
    """
    for attempt in range(MAX_TRANSACTION_ATTEMPTS):
        try:
            return await service.resume(
                user_id=user_id,
                idempotency_key=idempotency_key,
            )
        except DBAPIError as exc:
            if not _is_retryable_transaction_error(exc):
                raise

            try:
                await session.rollback()
            except Exception:
                # Never retry with a session whose transaction could not reset.
                raise exc

            if attempt + 1 >= MAX_TRANSACTION_ATTEMPTS:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=(
                        "The transfer could not be completed because of temporary "
                        "database contention. Retry using the same Idempotency-Key."
                    ),
                    headers={"Retry-After": "1"},
                ) from exc

            await asyncio.sleep(TRANSACTION_RETRY_DELAY_SECONDS * (attempt + 1))

    raise RuntimeError("Transaction recovery retry loop exited unexpectedly.")


def _get_transfer_method(value: str | None) -> TransferMethod | None:
    """Return a supported transfer method or None for unknown values."""
    if value in ("iban", "email"):
        return value

    return None


def _to_transaction_response(
    transaction: Transaction,
) -> TransactionResponse:
    """Map a persisted transaction to the public API response."""
    return TransactionResponse(
        id=transaction.id,
        created_at=transaction.created_at,
        source_account_id=transaction.source_account_id,
        destination_account_id=transaction.destination_account_id,
        amount=transaction.amount,
        transaction_type=transaction.transaction_type,
        status=transaction.status,
        reference=transaction.reference,
        transfer_method=_get_transfer_method(transaction.transfer_method),
    )


def _to_transaction_history_item(
    transaction: Transaction,
    direction: TransactionDirection,
) -> TransactionHistoryItem:
    """Map a transaction and counterparty details to a history item."""
    counterparty_account = (
        transaction.destination_account
        if direction == "outgoing"
        else transaction.source_account
    )
    counterparty_user = counterparty_account.user

    full_name = " ".join(
        part
        for part in (
            counterparty_user.first_name,
            counterparty_user.last_name,
        )
        if part and part.strip()
    ).strip()

    return TransactionHistoryItem(
        id=transaction.id,
        created_at=transaction.created_at,
        source_account_id=transaction.source_account_id,
        destination_account_id=transaction.destination_account_id,
        amount=transaction.amount,
        transaction_type=transaction.transaction_type,
        status=transaction.status,
        reference=transaction.reference,
        transfer_method=_get_transfer_method(transaction.transfer_method),
        direction=direction,
        counterparty_name=full_name or None,
        counterparty_email=counterparty_user.email,
        counterparty_iban=counterparty_account.iban,
    )


async def _execute_transaction_with_retry(
    *,
    processor: TransactionProcessing,
    session: AsyncSession,
    user_id: int,
    destination_iban: str | None,
    destination_email: str | None,
    amount: Decimal,
    idempotency_key: str,
    reference: str | None,
) -> Transaction:
    """
    Execute and commit a transaction, retrying known transient conflicts.

    Each retry starts after rollback and uses the same idempotency key.
    Only explicitly recognized PostgreSQL transaction conflicts are retried.
    """
    for attempt in range(MAX_TRANSACTION_ATTEMPTS):
        try:
            transaction = await processor.execute(
                user_id=user_id,
                destination_iban=destination_iban,
                destination_email=destination_email,
                amount=amount,
                idempotency_key=idempotency_key,
                reference=reference,
            )

            # Commit before returning control to the endpoint so that
            # retryable commit errors are handled within this boundary.
            await session.commit()

            return transaction

        except DBAPIError as exc:
            if not _is_retryable_transaction_error(exc):
                raise

            try:
                await session.rollback()
            except Exception:
                # Do not start another attempt with an unusable session.
                raise exc

            if attempt + 1 >= MAX_TRANSACTION_ATTEMPTS:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=(
                        "The transaction could not be completed because of "
                        "temporary database contention. Retry using the same "
                        "Idempotency-Key."
                    ),
                    headers={"Retry-After": "1"},
                ) from exc

            await asyncio.sleep(TRANSACTION_RETRY_DELAY_SECONDS * (attempt + 1))

    raise RuntimeError("Transaction retry loop exited unexpectedly.")


async def _resolve_idempotency_conflict(
    *,
    session: AsyncSession,
    account_repository: AccountRepository,
    transaction_repository: TransactionRepository,
    user_id: int,
    idempotency_key: str,
    destination_iban: str | None,
    destination_email: str | None,
    amount: Decimal,
    reference: str | None,
    original_error: IdempotencyPersistenceConflictError,
) -> Transaction:
    """Resolve a concurrent request using the persisted idempotency record."""
    await session.rollback()

    source_account = await account_repository.get_by_user_id(
        user_id=user_id,
    )

    if source_account is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The concurrent transaction could not be resolved. "
                "Please retry with the same Idempotency-Key."
            ),
        ) from original_error

    existing_transaction = await transaction_repository.get_by_idempotency_key(
        source_account_id=source_account.id,
        idempotency_key=idempotency_key,
    )

    if existing_transaction is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A concurrent transaction request conflicted with this "
                "request. Please retry using the same Idempotency-Key."
            ),
        ) from original_error

    request_fingerprint = TransactionProcessing.calculate_request_fingerprint(
        destination_iban=destination_iban,
        destination_email=destination_email,
        amount=amount,
        reference=reference,
    )

    if existing_transaction.request_fingerprint != request_fingerprint:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=("Idempotency key has already been used with a different request."),
        ) from original_error

    return existing_transaction


@router.get(
    "/bank-details",
    response_model=IbanBankIdentificationResponse,
)
async def identify_iban_bank_details(
    iban: str,
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> IbanBankIdentificationResponse:
    """Return Idemerax bank information for a valid IBAN."""
    del current_user

    repository = FinancialInstitutionRepository(session)

    try:
        bank_information = await identify_iban_bank(iban, repository)
    except IbanBankIdentificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return IbanBankIdentificationResponse(
        bank_code=bank_information.bank_code,
        bank_name=bank_information.bank_name,
        bic=bank_information.bic,
    )


@router.get("/idempotency/pending")
async def get_pending_transaction_recovery(
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """Return the authenticated user's durable pending transfer, if any."""
    service = RecoverTransaction(session)
    pending = await service.get_pending(current_user.id)
    if pending is None:
        return {"operation": None}

    operation, destination = pending
    return {
        "operation": {
            "idempotency_key": operation.idempotency_key,
            "status": operation.status,
            "created_at": operation.created_at.isoformat(),
            "recipient_method": operation.transfer_method,
            "recipient_iban": destination.iban
            if operation.transfer_method == "iban"
            else None,
            "recipient_email": destination.user.email
            if operation.transfer_method == "email"
            else None,
            "amount": str(operation.amount),
            "reference": operation.reference,
            "failure_code": operation.failure_code,
        }
    }


@router.get("/idempotency/{idempotency_key}")
async def get_transaction_idempotency_status(
    idempotency_key: Annotated[
        str,
        Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$"),
    ],
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """Return a user's durable operation status or legacy completed result."""
    service = RecoverTransaction(session)
    operation_status, operation, transaction = await service.get_status(
        user_id=current_user.id,
        idempotency_key=idempotency_key,
    )
    return {
        "status": operation_status,
        "failure_code": operation.failure_code if operation else None,
        "transaction": (
            _to_transaction_response(transaction).model_dump(mode="json")
            if transaction is not None
            else None
        ),
    }


@router.post("/idempotency/{idempotency_key}/resume")
async def resume_transaction_recovery(
    idempotency_key: Annotated[
        str,
        Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$"),
    ],
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """Resume a transfer from server-side data; no original body is required."""
    service = RecoverTransaction(session)
    try:
        operation_status, operation, transaction = await service.resume(
            user_id=current_user.id,
            idempotency_key=idempotency_key,
        )
    except RecoveryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction recovery record was not found.",
        ) from exc
    return {
        "status": operation_status,
        "failure_code": operation.failure_code,
        "transaction": (
            _to_transaction_response(transaction).model_dump(mode="json")
            if transaction is not None
            else None
        ),
    }


@router.get(
    "",
    response_model=TransactionHistoryResponse,
)
async def get_transaction_history(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> TransactionHistoryResponse:
    """Return a paginated transaction history for the authenticated user."""
    repository = TransactionRepository(session)

    transactions, total = await repository.list_for_user(
        user_id=current_user.id,
        limit=limit,
        offset=offset,
    )

    items = [
        _to_transaction_history_item(transaction, direction)
        for transaction, direction in transactions
    ]

    return TransactionHistoryResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_transaction(
    transaction_data: TransactionCreateRequest,
    response: Response,
    idempotency_key: Annotated[
        str,
        Header(
            alias="Idempotency-Key",
            min_length=1,
            max_length=128,
            pattern=r"^[A-Za-z0-9._:-]+$",
        ),
    ],
    current_user: User = Depends(get_completed_current_user),
    session: AsyncSession = Depends(get_session),
) -> TransactionResponse:
    """Durably reserve a transfer before attempting its execution."""
    # Capture the scalar before database operations can expire the ORM instance.
    user_id = current_user.id
    service = RecoverTransaction(session)
    try:
        prior_status, _prior_operation, prior_transaction = await service.get_status(
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        if prior_status == "COMPLETED" and prior_transaction is not None:
            supplied_fingerprint = TransactionProcessing.calculate_request_fingerprint(
                destination_iban=transaction_data.destination_iban,
                destination_email=(
                    str(transaction_data.destination_email)
                    if transaction_data.destination_email is not None
                    else None
                ),
                amount=transaction_data.amount,
                reference=transaction_data.reference,
            )
            if prior_transaction.request_fingerprint != supplied_fingerprint:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Idempotency key has already been used with a different "
                        "request."
                    ),
                )
            response.status_code = status.HTTP_200_OK
            return _to_transaction_response(prior_transaction)

        _operation, reservation_created = await service.reserve(
            user_id=user_id,
            idempotency_key=idempotency_key,
            destination_iban=transaction_data.destination_iban,
            destination_email=(
                str(transaction_data.destination_email)
                if transaction_data.destination_email is not None
                else None
            ),
            amount=transaction_data.amount,
            reference=transaction_data.reference,
        )
        operation_status, operation, transaction = await _resume_transaction_with_retry(
            service=service,
            session=session,
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
    except HTTPException:
        # A completed-key payload conflict is raised after get_status() has
        # opened a read transaction. Release it before returning the response.
        await _rollback_safely(session)
        raise
    except RecoveryConflictError as exc:
        await _rollback_safely(session)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except TransactionProcessingError as exc:
        await _rollback_safely(session)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except BaseException:
        # Also roll back on unexpected errors raised by get_status(), reserve(),
        # or recovery. Preserve the original exception if rollback itself fails.
        await _rollback_safely(session)
        raise

    if operation_status == "FAILED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transfer failed: " + str(operation.failure_code),
        )
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Transfer is reserved and awaiting recovery. Retry the same key.",
            headers={"Retry-After": "1"},
        )
    # reserve() atomically reports whether this request created the durable
    # idempotency record. This avoids a race between an earlier status lookup
    # and a concurrent request using the same key.
    response.status_code = (
        status.HTTP_201_CREATED if reservation_created else status.HTTP_200_OK
    )
    return _to_transaction_response(transaction)
