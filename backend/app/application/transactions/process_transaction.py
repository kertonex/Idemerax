import re
from decimal import Decimal

from app.application.accounts.ports import AccountRepositoryPort
from app.application.transactions.ports import (
    TransactionRepositoryPort,
    UserRepositoryPort,
)
from app.domain.account.iban import is_valid_iban
from app.domain.idempotency.fingerprint import transaction_fingerprint
from app.infrastructure.database.models.transaction import Transaction


class TransactionProcessingError(Exception):
    """Raise when transaction processing fails."""


class IdempotencyConflictError(TransactionProcessingError):
    """Raise when a key is reused for a different request."""


class InvalidIdempotencyKeyError(TransactionProcessingError):
    """Raise when a key does not meet the API contract."""


class TransactionProcessing:
    """Process an internal transfer with idempotent request handling."""

    IDEMPOTENCY_KEY_PATTERN = re.compile(r"[A-Za-z0-9._:-]{1,128}")
    MAX_REFERENCE_LENGTH = 140
    MAX_DECIMAL_PLACES = 4
    MAX_AMOUNT = Decimal("1000000000000000")

    def __init__(
        self,
        account_repository: AccountRepositoryPort,
        transaction_repository: TransactionRepositoryPort,
        user_repository: UserRepositoryPort,
    ) -> None:
        self.account_repository = account_repository
        self.transaction_repository = transaction_repository
        self.user_repository = user_repository
        self.last_request_replayed = False

    @classmethod
    def _validate_idempotency_key(cls, key: str) -> None:
        """Validate the required idempotency key."""
        if not isinstance(key, str) or not cls.IDEMPOTENCY_KEY_PATTERN.fullmatch(key):
            raise InvalidIdempotencyKeyError("Invalid Idempotency-Key format.")

    @classmethod
    def _validate_amount(cls, amount: Decimal) -> None:
        """Validate a positive amount within Numeric(19, 4) limits."""
        if not isinstance(amount, Decimal):
            raise TransactionProcessingError(
                "Transaction amount must be a decimal value."
            )

        if not amount.is_finite() or amount <= 0:
            raise TransactionProcessingError(
                "Transaction amount must be greater than zero."
            )

        exponent = amount.as_tuple().exponent
        if isinstance(exponent, int) and exponent < -cls.MAX_DECIMAL_PLACES:
            raise TransactionProcessingError(
                "Transaction amount supports at most four decimal places."
            )

        if amount >= cls.MAX_AMOUNT:
            raise TransactionProcessingError(
                "Transaction amount exceeds the supported maximum."
            )

    @classmethod
    def _normalize_reference(
        cls,
        reference: str | None,
    ) -> str | None:
        """Normalize an optional transaction reference."""
        if reference is None:
            return None

        if not isinstance(reference, str):
            raise TransactionProcessingError("Transaction reference must be a string.")

        normalized_reference = reference.strip() or None

        if (
            normalized_reference is not None
            and len(normalized_reference) > cls.MAX_REFERENCE_LENGTH
        ):
            raise TransactionProcessingError(
                "Transaction reference must not exceed 140 characters."
            )

        return normalized_reference

    @staticmethod
    def _normalize_iban(iban: str | None) -> str | None:
        """Remove whitespace and normalize an IBAN to uppercase."""
        if iban is None:
            return None

        return "".join(iban.split()).upper()

    @staticmethod
    def _normalize_email(email: str | None) -> str | None:
        """Normalize an email address for recipient lookup."""
        if email is None:
            return None

        return email.strip().lower()

    @classmethod
    def calculate_request_fingerprint(
        cls,
        *,
        destination_iban: str | None,
        destination_email: str | None,
        amount: Decimal,
        reference: str | None,
    ) -> str:
        """Calculate a fingerprint using normalized request values."""
        return transaction_fingerprint(
            destination_iban=cls._normalize_iban(destination_iban),
            destination_email=cls._normalize_email(destination_email),
            amount=amount,
            reference=cls._normalize_reference(reference),
        )

    @staticmethod
    def _get_existing_transaction(
        transaction: Transaction | None,
        request_fingerprint: str,
    ) -> Transaction | None:
        """Return a matching transaction or reject key reuse."""
        if transaction is None:
            return None

        if transaction.request_fingerprint != request_fingerprint:
            raise IdempotencyConflictError(
                "Idempotency key has already been used with a different request."
            )

        return transaction

    async def _find_existing_transaction(
        self,
        *,
        source_account_id: int,
        idempotency_key: str,
        request_fingerprint: str,
    ) -> Transaction | None:
        """Find a prior request and verify its fingerprint."""
        existing_transaction = await self.transaction_repository.get_by_idempotency_key(
            source_account_id=source_account_id,
            idempotency_key=idempotency_key,
        )

        return self._get_existing_transaction(
            existing_transaction,
            request_fingerprint,
        )

    async def execute(
        self,
        user_id: int,
        destination_iban: str | None,
        destination_email: str | None,
        amount: Decimal,
        *,
        idempotency_key: str,
        reference: str | None = None,
    ) -> Transaction:
        """Execute a transfer once per source account and idempotency key."""
        self.last_request_replayed = False

        self._validate_idempotency_key(idempotency_key)
        self._validate_amount(amount)

        if (destination_iban is None) == (destination_email is None):
            raise TransactionProcessingError(
                "Exactly one destination must be provided."
            )

        normalized_reference = self._normalize_reference(reference)
        normalized_iban = self._normalize_iban(destination_iban)
        normalized_email = self._normalize_email(destination_email)

        if normalized_iban is not None and not normalized_iban:
            raise TransactionProcessingError("Invalid destination IBAN.")

        if normalized_email is not None and not normalized_email:
            raise TransactionProcessingError("Destination email must not be empty.")

        request_fingerprint = self.calculate_request_fingerprint(
            destination_iban=normalized_iban,
            destination_email=normalized_email,
            amount=amount,
            reference=normalized_reference,
        )

        source_account = await self.account_repository.get_by_user_id(
            user_id=user_id,
        )

        if source_account is None:
            raise TransactionProcessingError("Source financial account not found.")

        # Fast path: return a previously committed matching request.
        replay = await self._find_existing_transaction(
            source_account_id=source_account.id,
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
        )

        if replay is not None:
            self.last_request_replayed = True
            return replay

        if normalized_iban is not None:
            if not is_valid_iban(normalized_iban):
                raise TransactionProcessingError("Invalid destination IBAN.")

            destination_account = await self.account_repository.get_by_iban(
                iban=normalized_iban,
            )
        else:
            if normalized_email is None:
                raise TransactionProcessingError(
                    "Exactly one destination must be provided."
                )

            destination_user = await self.user_repository.get_by_email(
                normalized_email,
            )

            if destination_user is None or not destination_user.is_active:
                raise TransactionProcessingError("Destination user not found.")

            destination_account = await self.account_repository.get_by_user_id(
                user_id=destination_user.id,
            )

        if destination_account is None:
            raise TransactionProcessingError("Destination financial account not found.")

        if source_account.id == destination_account.id:
            raise TransactionProcessingError(
                "Source and destination accounts must differ."
            )

        # Lock accounts in a stable order to reduce deadlock risk.
        account_ids = sorted({source_account.id, destination_account.id})

        locked_accounts = await self.account_repository.lock_for_transfer(
            account_ids=account_ids,
        )

        locked_accounts_by_id = {account.id: account for account in locked_accounts}

        source_account = locked_accounts_by_id.get(source_account.id)
        destination_account = locked_accounts_by_id.get(destination_account.id)

        if source_account is None or destination_account is None:
            raise TransactionProcessingError(
                "A source or destination account could not be locked."
            )

        # Recheck after locking because a concurrent request may have won.
        replay = await self._find_existing_transaction(
            source_account_id=source_account.id,
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
        )

        if replay is not None:
            self.last_request_replayed = True
            return replay

        if source_account.balance < amount:
            raise TransactionProcessingError("Insufficient funds.")

        if destination_account.balance + amount >= self.MAX_AMOUNT:
            raise TransactionProcessingError(
                "Destination account balance would exceed the supported maximum."
            )

        # Both balance mutations and the transaction insert must be part of
        # the same database transaction.
        source_account.balance -= amount
        destination_account.balance += amount

        return await self.transaction_repository.create(
            source_account_id=source_account.id,
            destination_account_id=destination_account.id,
            amount=amount,
            transaction_type="TRANSFER",
            status="COMPLETED",
            reference=normalized_reference,
            transfer_method=("iban" if normalized_iban is not None else "email"),
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
        )
