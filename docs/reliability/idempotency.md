# Idempotency & Transaction Recovery

This document describes the idempotency and durable-recovery contract implemented by the Idemerax backend. It is the detailed reference for clients, maintainers, and contributors working on transaction processing.

Idemerax is an educational fintech MVP. Transfers are simulated between Idemerax financial accounts; this contract does not describe real bank or payment-network processing.

## 1. Scope

The contract applies to authenticated transfer creation through `POST /transactions` and the related status/recovery endpoints under `/transactions/idempotency`.

The implementation is designed for requests that may be duplicated, retried, delayed, or interrupted by unreliable network conditions. It separates three things that clients must not conflate:

- **Request identity:** the `Idempotency-Key` together with the source account scope.
- **Request equivalence:** the server-calculated fingerprint of the normalized transfer intent.
- **Execution outcome:** the durable recovery status and, after completion, the persisted transaction.

## 2. Idempotency key contract

### Header and format

Every `POST /transactions` request must include an `Idempotency-Key` header.

The accepted value is 1–128 characters and must match:

```regex
^[A-Za-z0-9._:-]{1,128}$
```

Only ASCII letters, digits, periods, underscores, colons, and hyphens are accepted. The same format and length are used by the status and resume path parameters.

### Scope

A key is unique within the originating **source financial account**, not globally across all users or all accounts. PostgreSQL uniqueness constraints enforce `(source_account_id, idempotency_key)` for both durable recovery records and completed transaction records.

A client must generate a fresh key for each new logical transfer. Every retry, replay, or recovery attempt for that same logical transfer must reuse the original key. Do not replace the key merely because a request timed out or the network connection was interrupted.

The key is an idempotency identifier, not an authentication credential. All transaction and recovery endpoints still require an authenticated user.

### Expiration and retention

The current configuration does not define an idempotency-key TTL, expiration setting, or scheduled cleanup process. Do not assume that keys automatically become reusable after a time window. A key remains reserved for its source account while its corresponding recovery or transaction record is retained in the database.

## 3. Request fingerprinting

The backend calculates a SHA-256 fingerprint over the normalized transfer intent. The fingerprint is stored with the durable recovery reservation and with the completed transaction.

The canonical fingerprint payload contains these fields:

| Field | Canonicalization |
| --- | --- |
| `destination_iban` | Remove all whitespace and convert to uppercase. `null` remains `null`. |
| `destination_email` | Trim surrounding whitespace and convert to lowercase. `null` remains `null`. |
| `amount` | Require a finite `Decimal`; serialize as a fixed-point decimal string and remove insignificant trailing zeroes and a trailing decimal point. |
| `reference` | Trim surrounding whitespace; an empty string becomes `null`. |

The canonical payload is serialized as JSON with sorted keys, compact separators, and ASCII escaping, then encoded as UTF-8 and hashed with SHA-256. The resulting fingerprint is a 64-character lowercase hexadecimal string.

The key itself and transport/authentication details are not fingerprint fields. The source account scopes the key separately through the database uniqueness constraint. The reference is part of the fingerprint: changing the reference while reusing the same key is a different request and results in a conflict.

Consequently, values that differ only by the documented normalization rules (for example, IBAN letter case or surrounding whitespace) produce the same fingerprint. A materially different destination, amount, or reference does not.

## 4. Reservation, execution, and replay behavior

The backend uses a durable reservation before changing account balances:

1. Authenticate the caller and resolve the caller's source account.
2. Validate the key, amount, and exactly-one-destination requirement.
3. Normalize the transfer intent and calculate its fingerprint.
4. Look for an existing reservation for the source account and key.
   - Matching fingerprint: reuse the existing operation.
   - Different fingerprint: reject the request with `409 Conflict`.
5. For a new operation, resolve the destination account and persist a `PROCESSING` recovery record. This reservation is committed before balance changes begin.
6. Resume the reserved operation using the persisted source account, destination account, amount, reference, and transfer method. Existing reservations therefore do not depend on resolving mutable recipient details again.
7. Lock the relevant account rows, validate the available source balance and destination balance limit, then update both balances, create the transaction, and mark the recovery record `COMPLETED` in one database commit.

The source account and key are protected by a unique constraint. A partial unique index also allows at most one `PROCESSING` recovery record per source account. A different transfer that attempts to reserve another key while an earlier transfer is still awaiting confirmation is rejected with `409 Conflict` rather than silently replacing the pending operation.

### Replays

For an already completed operation:

- Same source account, same key, same fingerprint: reuse the existing operation. If it is already complete, return the original transaction as `200 OK`; if it is still `PROCESSING`, resume that reservation and return `200 OK` when it completes.
- Same source account and key, different fingerprint: return `409 Conflict`.

A new reservation created and completed by the current request returns `201 Created`. An existing matching reservation or completed transaction returns `200 OK`. The completed transaction, both balance changes, and the recovery record's terminal state are committed atomically. Replays and resumes do not apply the balance changes more than once.

## 5. Transaction and recovery states

The durable `transaction_recovery` record uses the following server-side states:

| State | Meaning | Next action |
| --- | --- | --- |
| `PROCESSING` | A durable transfer intent has been reserved, but no completed transaction is linked yet. It may be awaiting execution or recovery after an interruption. | Reconcile its status and resume it using the same key. |
| `COMPLETED` | The transfer has been applied and the resulting transaction is persisted. | Treat the transaction as complete. Replays return the existing result. |
| `FAILED` | The operation reached a terminal business failure and its failure code is persisted. | Do not resume this operation. A genuinely new transfer after the cause is addressed requires a new key. |

The implemented transitions are:

```text
PROCESSING ───────► COMPLETED
     │
     └────────────► FAILED
```

`COMPLETED` and `FAILED` are terminal in the current implementation. Calling the resume endpoint again returns the existing terminal result; it does not execute the transfer a second time.

### Failure codes

The recovery service currently persists these terminal failure codes:

| Failure code | Meaning |
| --- | --- |
| `ACCOUNT_NOT_FOUND` | A source or destination account required for the reserved operation is no longer available. |
| `INSUFFICIENT_FUNDS` | The source account balance is lower than the reserved transfer amount. |
| `BALANCE_LIMIT_EXCEEDED` | Applying the transfer would reach or exceed the configured maximum account balance supported by the implementation. |

These checks occur before balance mutations. A failed reservation is marked `FAILED` and returned without applying either side of the transfer.

### Unknown / recoverable outcome

`UNKNOWN` is **not** a persisted backend transaction state and is not one of the values returned by the status endpoint. It describes the client's knowledge when a request times out, the connection is lost, or a server-side error prevents the client from receiving a definitive response.

An unknown client outcome can correspond to a request that never reached the server, a durable `PROCESSING` reservation, or a transfer that completed even though the response did not reach the client. Therefore, a timeout or lost response must never be treated as proof that the transfer failed.

## 6. Safe retry and recovery expectations

For the same logical transfer, reuse both the original `Idempotency-Key` and the exact original request intent. Do not create a new key to get around an unknown outcome, a `409` response, or a temporarily unavailable status endpoint.

Recommended client reconciliation sequence:

1. **Persist the attempt identity.** Keep the original key and enough information to identify the exact recipient, amount, and reference. Do not allow the user to submit a different transfer while the previous attempt is unresolved.
2. **Treat an interrupted mutation as unknown.** Network failures and client timeouts can happen after the server has received the request. The frontend API client marks fetch failures, HTTP `408`, and HTTP `5xx` responses as outcomes that require reconciliation.
3. **Query the status endpoint** using the original key.
4. Handle the returned status:
   - `COMPLETED` with a transaction: show the persisted transaction and do not submit another transfer.
   - `FAILED`: show the persisted failure. Do not retry the same failed reservation. A new logical transfer, after correcting the cause, must use a new key.
   - `PROCESSING`: call the resume endpoint with the same key. The server has already stored the transfer intent, so the original request body is not required for server-side resume.
   - `NOT_FOUND`: no matching operation is currently visible for this user's source account. This response alone does not prove that an earlier network request can never arrive or that a legacy attempt failed. For a current attempt where the exact original request is available, retry only that exact request with the original key. For an older key-only attempt without a restorable server-side reservation, keep it unresolved and reconcile it against transaction history/account activity before starting a new transfer.
5. If status lookup or resume is itself interrupted, preserve the key and keep reconciling. Do not unlock the form for a different transfer until the prior attempt has a safe, definitive outcome.

A `503 Service Unavailable` response from transaction creation includes `Retry-After: 1`. It indicates that recognized transient database contention prevented the request from completing within the bounded retry policy. The durable reservation, if already created, remains available for reconciliation and may still be `PROCESSING`. The shared database-session boundary can also surface recognized transient conflicts as `503` from pending, status, and resume endpoints. In every case, clients should retry reconciliation after the suggested delay and must retain the same key rather than assume that no operation exists.

The frontend currently applies an 8-second timeout to transfer creation. That timeout bounds how long the UI waits; it does not cancel or roll back server-side work and does not change the idempotency contract.

## 7. Status reconciliation API

All endpoints below require the authenticated user's access token.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/transactions` | Create or replay a transfer. Requires `Idempotency-Key` and the original request body. |
| `GET` | `/transactions/idempotency/pending` | Return the authenticated user's pending durable reservation, or `{"operation": null}`. |
| `GET` | `/transactions/idempotency/{idempotency_key}` | Retrieve the operation state and, when completed, its transaction. |
| `POST` | `/transactions/idempotency/{idempotency_key}/resume` | Resume a `PROCESSING` reservation from its server-side snapshot; no request body is needed. |

### Read the pending operation

```http
GET /transactions/idempotency/pending
Authorization: Bearer <access-token>
```

When a reservation exists, the response contains its key, `PROCESSING` state, creation time, recipient method/details, amount, reference, and failure code. When no reservation exists:

```json
{
  "operation": null
}
```

### Read a specific operation

```http
GET /transactions/idempotency/<original-key>
Authorization: Bearer <access-token>
```

Example while a reservation is awaiting recovery:

```json
{
  "status": "PROCESSING",
  "failure_code": null,
  "transaction": null
}
```

Example after completion:

```json
{
  "status": "COMPLETED",
  "failure_code": null,
  "transaction": {
    "id": 123,
    "created_at": "2026-11-06T08:00:00Z",
    "source_account_id": 10,
    "destination_account_id": 20,
    "amount": "25.0000",
    "transaction_type": "TRANSFER",
    "status": "COMPLETED",
    "reference": "Invoice 1042",
    "transfer_method": "iban"
  }
}
```

Example when there is no matching record:

```json
{
  "status": "NOT_FOUND",
  "failure_code": null,
  "transaction": null
}
```

The status lookup is scoped to the authenticated user's source account. A key belonging to another user's account is returned as `NOT_FOUND`, rather than disclosing that operation.

Example after a terminal business failure:

```json
{
  "status": "FAILED",
  "failure_code": "INSUFFICIENT_FUNDS",
  "transaction": null
}
```

### Resume a reserved operation

```http
POST /transactions/idempotency/<original-key>/resume
Authorization: Bearer <access-token>
```

Example successful response:

```json
{
  "status": "COMPLETED",
  "failure_code": null,
  "transaction": {
    "id": 123,
    "created_at": "2026-11-06T08:00:00Z",
    "source_account_id": 10,
    "destination_account_id": 20,
    "amount": "25.0000",
    "transaction_type": "TRANSFER",
    "status": "COMPLETED",
    "reference": "Invoice 1042",
    "transfer_method": "iban"
  }
}
```

A terminal failed operation returns `status: "FAILED"`, its `failure_code`, and `transaction: null`. A missing or unowned recovery reservation on the resume endpoint returns `404 Not Found` with a standard FastAPI `detail` response. The status endpoint instead returns `200 OK` with `status: "NOT_FOUND"` for missing or unowned keys.

A key/fingerprint conflict returns `409 Conflict` with a JSON `detail` explaining that the key was already used with a different request. A competing pending transfer uses the same status with a message that another transfer is awaiting confirmation. A terminal reserved-operation failure from transfer creation returns `400 Bad Request`, for example `{"detail": "Transfer failed: INSUFFICIENT_FUNDS"}`. Transient PostgreSQL transaction conflicts return `503 Service Unavailable`; the response has a JSON `detail` and a `Retry-After: 1` header.

## 8. HTTP response contract

### `POST /transactions`

| HTTP status | Meaning | Client behavior |
| --- | --- | --- |
| `201 Created` | A new reservation completed successfully. | Accept the returned transaction. |
| `200 OK` | An existing matching reservation was completed, or a previously completed transaction was replayed. | Accept the returned transaction; do not apply another transfer. |
| `400 Bad Request` | Transfer validation failed, or the reserved operation reached a terminal business failure. A terminal failure response has a detail such as `Transfer failed: INSUFFICIENT_FUNDS`. | Treat a known terminal failure as failed. Do not resubmit that same failed reservation. |
| `401 Unauthorized` | Authentication is missing or invalid. | Restore authentication, then reconcile the original key before taking further action. |
| `409 Conflict` | The key was reused with a different fingerprint, or another transfer is already awaiting confirmation for the source account. | Do not switch keys or alter the payload. Reconcile the original and pending server operation. |
| `422 Unprocessable Entity` | The request body or `Idempotency-Key` header failed FastAPI/Pydantic validation. | Correct invalid input. Do not treat a validation error as evidence that a different in-flight attempt completed. |
| `503 Service Unavailable` | Recognized transient database contention exhausted the bounded retry. The response includes `Retry-After: 1`; the durable reservation remains available for reconciliation and may still be `PROCESSING`. | Preserve the same key. Reconcile the status and resume the same logical request; never create a replacement key. |

The `Idempotency-Key` validation rule is also applied to status and resume path parameters. Invalid path keys result in `422`.

### Status and resume endpoints

- `GET /transactions/idempotency/{idempotency_key}` returns `200 OK` with one of `NOT_FOUND`, `PROCESSING`, `COMPLETED`, or `FAILED`. A missing key is represented in the response body, not as HTTP `404`.
- `GET /transactions/idempotency/pending` returns `200 OK`; `operation` is either a pending operation object or `null`.
- `POST /transactions/idempotency/{idempotency_key}/resume` returns `200 OK` with a terminal `COMPLETED` or `FAILED` result. The endpoint attempts to finish a `PROCESSING` reservation synchronously; it does not return `PROCESSING`. `404` means no matching recovery record is available to the authenticated user.
- The status, pending, and resume endpoints can return `503 Service Unavailable` with `Retry-After: 1` when the shared database-session boundary detects a recognized transient PostgreSQL transaction conflict. Retry the reconciliation request after the suggested delay; retain the original idempotency key.

## 9. Persistence, migrations, and configuration

### Persisted data and constraints

The `transaction_recovery` table stores the durable intent required to resume a transfer:

- source and destination account IDs;
- idempotency key and SHA-256 request fingerprint;
- amount, reference, and transfer method;
- recovery status, optional transaction ID, and failure code;
- creation and update timestamps.

The `transactions` table also stores the idempotency key and fingerprint for completed operations. Historical transactions may have both fields set to `null`; database constraints require the two fields to be present together when either is set.

Important PostgreSQL constraints include:

- unique `(source_account_id, idempotency_key)` on recovery records;
- a partial unique index allowing only one `PROCESSING` recovery record per source account;
- unique `(source_account_id, idempotency_key)` on transactions;
- format and consistency checks for keys, fingerprints, recovery statuses, amounts, and transfer methods.

### Relevant Alembic migrations

| Revision | Purpose |
| --- | --- |
| `f67e7de5a683` | Creates the transaction table and account relationships. |
| `f18a6b2d9c41` | Adds idempotency key and request fingerprint metadata to transactions and the source-account/key uniqueness constraint. |
| `b4e81c2a9f63` | Validates existing idempotency metadata and adds database check constraints while preserving historical rows without idempotency metadata. |
| `ce71b4a09d32` | Creates durable transaction recovery records and the one-pending-operation-per-source-account partial unique index. |

Apply the repository's migrations from the backend directory:

```bash
cd backend
uv sync
uv run alembic upgrade head
```

The idempotency-constraint migration checks existing transaction rows before creating constraints. If invalid metadata is found, it aborts with the number of affected rows so that the data can be reviewed and repaired before rerunning the migration. Review and back up non-disposable database data before applying schema changes. The documentation and OpenAPI-description updates do not add a database migration; the commands above bring an existing database up to the current repository schema.

### Configuration

The current backend does not expose idempotency-specific environment variables. The key format, SHA-256 fingerprinting, and recovery constraints are defined in application/database code. In particular, there is no configured TTL or key-expiration interval to document or tune.

## 10. Security and operational boundaries

- Transfer creation, pending lookup, status lookup, and resume all require an authenticated user.
- A recovery record is looked up through the source account owned by the authenticated user. Status lookup does not disclose another user's operation.
- Database constraints provide a final uniqueness boundary in addition to application-level checks.
- The recovery reservation stores the resolved destination account, so a later retry does not silently resolve a changed recipient email to a different account.
- The system transfers simulated balances between Idemerax accounts only. It is not connected to real banks, payment providers, card networks, or real-money settlement infrastructure.

## 11. Related API documentation

When the backend is running, the generated FastAPI documentation is available at:

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

The transaction route metadata and Pydantic response models describe the request header and the pending, status, and resume response shapes in the generated OpenAPI schema. This document provides the longer operational contract and retry guidance.
