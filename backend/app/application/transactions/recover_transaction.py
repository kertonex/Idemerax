import re
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.transactions.process_transaction import (
    TransactionProcessing,
    TransactionProcessingError,
)
from app.domain.account.iban import is_valid_iban
from app.infrastructure.database.models.account import Account
from app.infrastructure.database.models.transaction import Transaction
from app.infrastructure.database.models.transaction_recovery import TransactionRecovery
from app.infrastructure.repositories.account import AccountRepository
from app.infrastructure.repositories.transaction import TransactionRepository
from app.infrastructure.repositories.transaction_recovery import (
    TransactionRecoveryRepository,
)
from app.infrastructure.repositories.user import UserRepository


class RecoveryConflictError(Exception):
    """Raised when a key conflicts with a different request or pending transfer."""


class RecoveryNotFoundError(Exception):
    """Raised when the authenticated user has no matching recovery operation."""


class RecoverTransaction:
    """Reserve transfer intent durably and resume it without the original body."""

    KEY_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
    MAX_AMOUNT = TransactionProcessing.MAX_AMOUNT
    IDEMPOTENCY_CONSTRAINT = "uq_transaction_recovery_source_key"
    PENDING_TRANSFER_CONSTRAINT = "uq_transaction_recovery_one_processing_per_source"

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.accounts = AccountRepository(session)
        self.users = UserRepository(session)
        self.transactions = TransactionRepository(session)
        self.recovery = TransactionRecoveryRepository(session)

    @staticmethod
    def _get_integrity_constraint_name(error: IntegrityError) -> str | None:
        """Return the PostgreSQL constraint/index name for an integrity error."""
        original_error = error.orig
        constraint_name = getattr(original_error, "constraint_name", None)
        if constraint_name is not None:
            return constraint_name

        diagnostic = getattr(original_error, "diag", None)
        return getattr(diagnostic, "constraint_name", None)

    async def reserve(
        self,
        *,
        user_id: int,
        idempotency_key: str,
        destination_iban: str | None,
        destination_email: str | None,
        amount: Decimal,
        reference: str | None,
    ) -> tuple[TransactionRecovery, bool]:
        """Persist the transfer intent and report whether this call created it.

        Existing idempotency records are checked before resolving the recipient.
        Once an operation has been reserved, retries must rely on that durable
        snapshot rather than on mutable recipient data such as email or account
        activation state.
        """
        if not isinstance(idempotency_key, str) or not self.KEY_PATTERN.fullmatch(
            idempotency_key
        ):
            raise TransactionProcessingError("Invalid Idempotency-Key format.")

        TransactionProcessing._validate_amount(amount)

        normalized_reference = TransactionProcessing._normalize_reference(reference)
        iban = TransactionProcessing._normalize_iban(destination_iban)
        email = TransactionProcessing._normalize_email(destination_email)

        if (iban is None) == (email is None):
            raise TransactionProcessingError(
                "Exactly one destination must be provided."
            )
        if iban is not None and not iban:
            raise TransactionProcessingError("Invalid destination IBAN.")
        if email is not None and not email:
            raise TransactionProcessingError("Destination email must not be empty.")

        source = await self.accounts.get_by_user_id(user_id=user_id)
        if source is None:
            raise TransactionProcessingError("Source financial account not found.")

        # Capture scalar state before any rollback can expire ORM instances.
        source_account_id = source.id
        fingerprint = TransactionProcessing.calculate_request_fingerprint(
            destination_iban=iban,
            destination_email=email,
            amount=amount,
            reference=normalized_reference,
        )

        existing = await self.recovery.get_by_key(
            source_account_id,
            idempotency_key,
        )
        if existing is not None:
            if existing.request_fingerprint != fingerprint:
                raise RecoveryConflictError(
                    "Idempotency key has already been used with a different request."
                )
            return existing, False

        # Resolve a destination only for a new operation. An existing recovery
        # record remains resumable even if the recipient's mutable user details
        # have since changed.
        if iban is not None:
            if not is_valid_iban(iban):
                raise TransactionProcessingError("Invalid destination IBAN.")

            destination = await self.accounts.get_by_iban(iban=iban)
            method = "iban"
        else:
            # The exactly-one-destination check above guarantees an email here.
            assert email is not None
            recipient = await self.users.get_by_email(email)
            if recipient is None or not recipient.is_active:
                raise TransactionProcessingError("Destination user not found.")

            destination = await self.accounts.get_by_user_id(user_id=recipient.id)
            method = "email"

        if destination is None:
            raise TransactionProcessingError("Destination financial account not found.")

        if source_account_id == destination.id:
            raise TransactionProcessingError(
                "Source and destination accounts must differ."
            )

        operation = TransactionRecovery(
            source_account_id=source_account_id,
            destination_account_id=destination.id,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            amount=amount,
            reference=normalized_reference,
            transfer_method=method,
            status="PROCESSING",
        )

        try:
            await self.recovery.create(operation)

            # The intent is durable before any account balance is modified.
            await self.session.commit()
            return operation, True

        except IntegrityError as exc:
            await self.session.rollback()

            constraint_name = self._get_integrity_constraint_name(exc)
            recovery_constraints = {
                self.IDEMPOTENCY_CONSTRAINT,
                self.PENDING_TRANSFER_CONSTRAINT,
            }

            # Only the two recovery uniqueness constraints can represent a
            # competing reservation. Never infer a replay from the mere
            # existence of a matching key after an unrelated integrity error.
            if constraint_name not in recovery_constraints:
                raise

            existing = await self.recovery.get_by_key(
                source_account_id,
                idempotency_key,
            )
            if existing is not None:
                if existing.request_fingerprint != fingerprint:
                    raise RecoveryConflictError(
                        "Idempotency key has already been used with a different "
                        "request."
                    ) from exc
                return existing, False

            if constraint_name == self.PENDING_TRANSFER_CONSTRAINT:
                raise RecoveryConflictError(
                    "Another transfer is already awaiting confirmation "
                    "for this account."
                ) from exc

            # The idempotency uniqueness violation should have a corresponding
            # row after rollback. If it does not, preserve the database error.
            raise

    async def resume(
        self,
        *,
        user_id: int,
        idempotency_key: str,
    ) -> tuple[str, TransactionRecovery, Transaction | None]:
        """Resume a reserved transfer under row locks and commit it atomically."""
        owned = await self.recovery.get_owned_operation(
            user_id,
            idempotency_key,
            for_update=True,
        )

        if owned is None:
            raise RecoveryNotFoundError

        operation, _destination = owned

        if operation.status == "COMPLETED":
            transaction = await self.transactions.get_by_id(operation.transaction_id)
            return "COMPLETED", operation, transaction

        if operation.status == "FAILED":
            return "FAILED", operation, None

        locked = await self.accounts.lock_for_transfer(
            [operation.source_account_id, operation.destination_account_id]
        )
        by_id = {account.id: account for account in locked}

        source_account = by_id.get(operation.source_account_id)
        destination_account = by_id.get(operation.destination_account_id)

        if source_account is None or destination_account is None:
            operation.status = "FAILED"
            operation.failure_code = "ACCOUNT_NOT_FOUND"
            await self.session.commit()
            return "FAILED", operation, None

        if source_account.balance < operation.amount:
            operation.status = "FAILED"
            operation.failure_code = "INSUFFICIENT_FUNDS"
            await self.session.commit()
            return "FAILED", operation, None

        if destination_account.balance + operation.amount >= self.MAX_AMOUNT:
            operation.status = "FAILED"
            operation.failure_code = "BALANCE_LIMIT_EXCEEDED"
            await self.session.commit()
            return "FAILED", operation, None

        source_account.balance -= operation.amount
        destination_account.balance += operation.amount

        transaction = await self.transactions.create(
            source_account_id=source_account.id,
            destination_account_id=destination_account.id,
            amount=operation.amount,
            transaction_type="TRANSFER",
            status="COMPLETED",
            reference=operation.reference,
            transfer_method=operation.transfer_method,
            idempotency_key=operation.idempotency_key,
            request_fingerprint=operation.request_fingerprint,
        )

        operation.status = "COMPLETED"
        operation.transaction_id = transaction.id
        operation.failure_code = None

        # Balances, transaction, and recovery result commit atomically.
        await self.session.commit()
        return "COMPLETED", operation, transaction

    async def get_pending(
        self,
        user_id: int,
    ) -> tuple[TransactionRecovery, Account] | None:
        return await self.recovery.get_pending_for_user(user_id)

    async def get_status(
        self,
        *,
        user_id: int,
        idempotency_key: str,
    ) -> tuple[str, TransactionRecovery | None, Transaction | None]:
        owned = await self.recovery.get_owned_operation(
            user_id,
            idempotency_key,
        )

        if owned is None:
            # Completed records from the pre-recovery implementation remain
            # discoverable through the transaction's existing unique key.
            source = await self.accounts.get_by_user_id(user_id=user_id)
            if source is None:
                return "NOT_FOUND", None, None

            transaction = await self.transactions.get_by_idempotency_key(
                source.id,
                idempotency_key,
            )
            if transaction is not None:
                return "COMPLETED", None, transaction
            return "NOT_FOUND", None, None

        operation, _destination = owned
        transaction = None
        if operation.transaction_id is not None:
            transaction = await self.transactions.get_by_id(operation.transaction_id)

        return operation.status, operation, transaction
