import { useEffect, useRef, useState } from 'react';

import { getMyAccount, type Account } from '../features/accounts/api/accounts';
import { getCurrentUser } from '../features/authentication/api/authentication';
import { useAuth } from '../features/authentication/context/useAuth';
import {
  createTransaction,
  getTransactionIdempotencyStatus,
  getPendingTransactionRecovery,
  resumeTransaction,
  type PendingTransactionRecovery,
  type Transaction,
  type TransactionCreateRequest,
} from '../features/transactions/api/transactions';
import { ApiClientError } from '../shared/api/client';
import { getHealth } from '../shared/api/health';
import TransactionForm from '../features/transactions/components/TransactionForm';
import TransactionHistory from '../features/transactions/components/TransactionHistory';

type TransactionMode = 'send' | 'receive' | 'history';

type PendingTransactionAttempt = {
  key: string;
  signature: string;
  protocolVersion?: 2;
  request?: TransactionCreateRequest;
};

const PENDING_TRANSACTION_STORAGE_PREFIX = 'idemerax:pending-transaction:v1:';

const AMBIGUOUS_TRANSACTION_MESSAGE =
  'We could not confirm whether this transfer completed. Retry the same recipient, amount and reference; the same idempotency key will be reused.';

const DIFFERENT_TRANSACTION_BLOCK_MESSAGE =
  'A previous transfer may have completed. Retry the exact same recipient, amount and reference first. Do not start another transfer until the previous result is confirmed.';

function getPendingStorageKey(userId: number): string {
  return `${PENDING_TRANSACTION_STORAGE_PREFIX}${userId}`;
}

function readPendingAttempt(userId: number): PendingTransactionAttempt | null {
  try {
    const raw = window.sessionStorage.getItem(getPendingStorageKey(userId));

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      window.sessionStorage.removeItem(getPendingStorageKey(userId));
      return null;
    }

    const parsedRecord = parsed as Record<string, unknown>;

    if (
      typeof parsedRecord.key !== 'string' ||
      typeof parsedRecord.signature !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(parsedRecord.key)
    ) {
      window.sessionStorage.removeItem(getPendingStorageKey(userId));
      return null;
    }

    const storedRequest = parsedRecord.request;
    const request =
      typeof storedRequest === 'object' &&
      storedRequest !== null &&
      typeof (storedRequest as Record<string, unknown>).amount === 'string' &&
      (typeof (storedRequest as Record<string, unknown>).destination_iban ===
        'string' ||
        typeof (storedRequest as Record<string, unknown>).destination_email ===
          'string')
        ? (storedRequest as TransactionCreateRequest)
        : undefined;

    return {
      key: parsedRecord.key,
      signature: parsedRecord.signature,
      ...(parsedRecord.protocolVersion === 2
        ? { protocolVersion: 2 as const }
        : {}),
      ...(request ? { request } : {}),
    };
  } catch {
    // Storage may be unavailable in a restricted browser context.
    // In-memory idempotency still works during the current page lifetime.
    return null;
  }
}

function storePendingAttempt(
  userId: number,
  attempt: PendingTransactionAttempt,
): void {
  try {
    // Keep the exact request in sessionStorage so an ambiguous transfer can be
    // replayed after a page reload. Session storage is scoped to this tab and
    // the entry is removed as soon as the outcome is definitive.
    window.sessionStorage.setItem(
      getPendingStorageKey(userId),
      JSON.stringify(attempt),
    );
  } catch {
    // The server-side idempotency constraint remains the final protection.
  }
}

function clearPendingAttempt(userId: number): void {
  try {
    window.sessionStorage.removeItem(getPendingStorageKey(userId));
  } catch {
    // The operation remains safe in memory for this page instance.
  }
}

function canonicalAmount(amount: string): string {
  const normalized = amount.trim().replace(',', '.');
  const [wholePart = '0', fractionalPart = ''] = normalized.split('.');
  const whole = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionalPart.replace(/0+$/, '');

  return fraction ? `${whole}.${fraction}` : whole;
}

function requestSignature(request: TransactionCreateRequest): string {
  const canonicalRequest = JSON.stringify({
    destination_iban: request.destination_iban
      ? request.destination_iban.replace(/\s+/g, '').toUpperCase()
      : null,
    destination_email: request.destination_email?.trim().toLowerCase() ?? null,
    amount: canonicalAmount(request.amount),
    reference: request.reference?.trim() || null,
  });

  // This local non-cryptographic hash is only used to match a retry after
  // a refresh. The backend's SHA-256 fingerprint is authoritative for safety.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < canonicalRequest.length; index += 1) {
    const code = canonicalRequest.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }

  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

function generateIdempotencyKey(): string {
  const browserCrypto = globalThis.crypto;

  if (typeof browserCrypto?.randomUUID === 'function') {
    return browserCrypto.randomUUID();
  }

  if (typeof browserCrypto?.getRandomValues !== 'function') {
    throw new Error('Secure random number generation is unavailable.');
  }

  const bytes = browserCrypto.getRandomValues(new Uint8Array(16));

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

function formatAmount(amount: string): string {
  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return '0,00 €';
  }

  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatCreatedAt(createdAt: string): string {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatIban(iban: string): string {
  return iban
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function maskIban(iban: string): string {
  const normalized = iban.replace(/\s+/g, '').toUpperCase();
  if (normalized.length <= 8) return normalized;
  return `${normalized.slice(0, 2)}${'•'.repeat(Math.max(4, normalized.length - 6))}${normalized.slice(-4)}`;
}

interface CopyButtonProps {
  value: string;
  label: string;
  copiedField: string | null;
  onCopy: (field: string, value: string) => Promise<void>;
}

function CopyButton({ value, label, copiedField, onCopy }: CopyButtonProps) {
  const isCopied = copiedField === label;

  return (
    <button
      type="button"
      onClick={() => void onCopy(label, value)}
      className="shrink-0 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      aria-label={`Copy ${label}`}
    >
      {isCopied ? 'Copied' : 'Copy'}
    </button>
  );
}

function TransactionsPage() {
  const { accessToken } = useAuth();

  return (
    <TransactionsPageContent
      key={accessToken ?? 'unauthenticated'}
      accessToken={accessToken}
    />
  );
}

interface TransactionsPageContentProps {
  accessToken: string | null;
}

function TransactionsPageContent({
  accessToken,
}: TransactionsPageContentProps) {
  const [mode, setMode] = useState<TransactionMode>('send');

  const [account, setAccount] = useState<Account | null>(null);
  const [isLoadingAccount, setIsLoadingAccount] = useState(() =>
    Boolean(accessToken),
  );
  const [accountError, setAccountError] = useState<string | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(() =>
    Boolean(accessToken),
  );
  const [userError, setUserError] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [historyTransactionId, setHistoryTransactionId] = useState<
    number | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRetryingUncertain, setIsRetryingUncertain] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [pendingStatusMessage, setPendingStatusMessage] = useState<
    string | null
  >(null);
  const [pendingRecovery, setPendingRecovery] =
    useState<PendingTransactionRecovery | null>(null);
  const [hasRecoveryKeyConflict, setHasRecoveryKeyConflict] = useState(false);
  const [isLoadingRecovery, setIsLoadingRecovery] = useState(
    Boolean(accessToken),
  );
  const [pendingAttemptProtocolVersion, setPendingAttemptProtocolVersion] =
    useState<1 | 2 | null>(null);
  const [recoveryLookupFailed, setRecoveryLookupFailed] = useState(false);

  const pendingAttemptRef = useRef<PendingTransactionAttempt | null>(null);
  // Keep the exact request in memory for safe replay during this page lifetime.
  // The request body is deliberately never persisted to sessionStorage.
  const pendingRequestRef = useRef<TransactionCreateRequest | null>(null);
  const submissionLockRef = useRef(false);
  const statusCheckLockRef = useRef(false);
  const reconnectQueuedRef = useRef(false);
  const activeSubmissionControllerRef = useRef<AbortController | null>(null);
  const connectionLostRef = useRef(false);
  const autoRecoveryStartedRef = useRef(false);
  const reconnectCheckRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const token = accessToken;
    let isMounted = true;

    async function loadAccount(): Promise<void> {
      try {
        setIsLoadingAccount(true);
        setAccountError(null);

        const currentAccount = await getMyAccount(token);

        if (isMounted) {
          setAccount(currentAccount);
        }
      } catch (accountLoadingError) {
        if (isMounted) {
          setAccountError(
            accountLoadingError instanceof Error
              ? accountLoadingError.message
              : 'Unable to load account.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingAccount(false);
        }
      }
    }

    async function loadUser(): Promise<void> {
      try {
        setIsLoadingUser(true);
        setUserError(null);

        const currentUser = await getCurrentUser(token);

        if (isMounted) {
          setUserEmail(currentUser.email);
          setUserId(currentUser.id);

          const pendingAttempt = readPendingAttempt(currentUser.id);
          if (pendingAttempt && !pendingAttemptRef.current) {
            pendingAttemptRef.current = pendingAttempt;
            setPendingAttemptProtocolVersion(
              pendingAttempt.protocolVersion === 2 ? 2 : 1,
            );
            pendingRequestRef.current = pendingAttempt.request ?? null;
          }

          try {
            const recoveryResponse = await getPendingTransactionRecovery(token);
            if (!isMounted) return;
            setRecoveryLookupFailed(false);

            const localAttempt = pendingAttemptRef.current;
            if (
              recoveryResponse.operation &&
              (!localAttempt ||
                recoveryResponse.operation.idempotency_key === localAttempt.key)
            ) {
              setPendingRecovery(recoveryResponse.operation);
              if (!localAttempt) {
                const serverAttempt: PendingTransactionAttempt = {
                  key: recoveryResponse.operation.idempotency_key,
                  signature: '',
                  protocolVersion: 2,
                };
                pendingAttemptRef.current = serverAttempt;
                setPendingAttemptProtocolVersion(2);
                storePendingAttempt(currentUser.id, serverAttempt);
              }
              setIsRetryingUncertain(true);
              setPendingStatusMessage(
                'Your original transfer details have been restored from the server. You can safely resume this exact transfer.',
              );
            } else if (recoveryResponse.operation && localAttempt) {
              // Keep the locally persisted attempt authoritative. A different
              // server operation must not silently replace its idempotency key.
              setHasRecoveryKeyConflict(true);
              setPendingRecovery(null);
              setIsRetryingUncertain(true);
              setPendingStatusMessage(
                'A different transfer is pending on the server. The original attempt remains locked; resolve the server-side transfer first.',
              );
            } else {
              setPendingRecovery(null);
              setHasRecoveryKeyConflict(false);
            }
          } catch {
            // A failed recovery lookup must never unlock a new transfer.
            if (isMounted) setRecoveryLookupFailed(true);
          }

          if (pendingAttempt && pendingAttemptRef.current === pendingAttempt) {
            try {
              const previousStatus = await getTransactionIdempotencyStatus(
                token,
                pendingAttempt.key,
              );
              if (
                previousStatus.status === 'COMPLETED' &&
                previousStatus.transaction
              ) {
                pendingAttemptRef.current = null;
                setPendingAttemptProtocolVersion(null);
                clearPendingAttempt(currentUser.id);
                setTransaction(previousStatus.transaction);
              } else if (previousStatus.status === 'FAILED') {
                pendingAttemptRef.current = null;
                setPendingAttemptProtocolVersion(null);
                clearPendingAttempt(currentUser.id);
                setError(
                  `The previous transfer failed (${previousStatus.failure_code ?? 'unknown reason'}). You can start a new transfer.`,
                );
              } else {
                // NOT_FOUND is not sufficient to discard an uncertain attempt: the
                // original request may still be delayed in the network. Keep its
                // key/signature and require an exact-payload retry.
                setIsRetryingUncertain(true);
                setPendingStatusMessage(
                  pendingAttempt.protocolVersion === 2
                    ? pendingAttempt.request
                      ? 'The saved transfer has been restored. Idemerax is checking its status and will safely retry the same request if needed.'
                      : 'No result is recorded yet. Re-enter the exact same recipient, amount and reference to retry with the original key.'
                    : 'The previous transfer remains unresolved. Check its status before starting another transfer.',
                );
              }
            } catch {
              setIsRetryingUncertain(true);
            }
          }

          if (
            pendingAttempt &&
            pendingAttempt.protocolVersion !== 2 &&
            pendingAttemptRef.current?.signature !== ''
          ) {
            setError(AMBIGUOUS_TRANSACTION_MESSAGE);
            setPendingStatusMessage(
              'A previous transfer needs confirmation. Check its status before retrying it.',
            );
          }
        }
      } catch (userLoadingError) {
        if (isMounted) {
          setRecoveryLookupFailed(true);
          setUserError(
            userLoadingError instanceof Error
              ? userLoadingError.message
              : 'Unable to load account email.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingUser(false);
          setIsLoadingRecovery(false);
        }
      }
    }

    void loadAccount();
    void loadUser();

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  async function handleRefreshRecovery(): Promise<void> {
    if (!accessToken || statusCheckLockRef.current || submissionLockRef.current)
      return;
    statusCheckLockRef.current = true;
    setIsCheckingStatus(true);
    try {
      const result = await getPendingTransactionRecovery(accessToken);
      setRecoveryLookupFailed(false);
      if (result.operation) {
        const serverKey = result.operation.idempotency_key;
        const localAttempt = pendingAttemptRef.current;

        // Never replace a locally persisted uncertain attempt with a different
        // server recovery key. The local key may belong to a request whose
        // outcome is still unknown, so keep it locked for status resolution.
        if (localAttempt?.key && localAttempt.key !== serverKey) {
          // Keep the server operation visible for diagnosis, but the resume
          // handler below must refuse to run it while the local key conflicts.
          setHasRecoveryKeyConflict(true);
          setPendingRecovery(result.operation);
          setIsRetryingUncertain(true);
          setError(
            'A recovery conflict was detected: the server reports a different transfer key than the saved attempt. The original attempt remains locked. Check its status before taking further action.',
          );
          setPendingStatusMessage(
            'The saved transfer key does not match the server recovery key. The original attempt has been preserved; no new transfer can be started.',
          );
        } else {
          setHasRecoveryKeyConflict(false);
          setPendingRecovery(result.operation);
          const restoredAttempt: PendingTransactionAttempt = {
            key: serverKey,
            signature: '',
            protocolVersion: 2,
          };
          pendingAttemptRef.current = restoredAttempt;
          setPendingAttemptProtocolVersion(2);
          if (userId !== null) storePendingAttempt(userId, restoredAttempt);
          setIsRetryingUncertain(true);
          setPendingStatusMessage(
            'The original transfer details have been restored from the server.',
          );
        }
      } else if (pendingAttemptRef.current?.key) {
        setPendingRecovery(null);
        setHasRecoveryKeyConflict(false);
        const keyAttempt = pendingAttemptRef.current;
        const status = await getTransactionIdempotencyStatus(
          accessToken,
          keyAttempt.key,
        );
        if (status.status === 'COMPLETED' && status.transaction) {
          pendingAttemptRef.current = null;
          setPendingAttemptProtocolVersion(null);
          if (userId !== null) clearPendingAttempt(userId);
          setIsRetryingUncertain(false);
          setTransaction(status.transaction);
          setPendingStatusMessage(null);
        } else if (status.status === 'FAILED') {
          pendingAttemptRef.current = null;
          setPendingAttemptProtocolVersion(null);
          if (userId !== null) clearPendingAttempt(userId);
          setIsRetryingUncertain(false);
          setError(
            `The previous transfer failed (${status.failure_code ?? 'unknown reason'}). You can start a new transfer.`,
          );
        } else {
          setIsRetryingUncertain(true);
          setPendingStatusMessage(
            'The previous transfer is still unresolved. Keep it locked until its status is confirmed.',
          );
        }
      } else {
        setPendingRecovery(null);
        setHasRecoveryKeyConflict(false);
        setIsRetryingUncertain(false);
        setPendingStatusMessage(null);
      }
    } catch {
      setRecoveryLookupFailed(true);
    } finally {
      statusCheckLockRef.current = false;
      setIsCheckingStatus(false);
      if (reconnectQueuedRef.current) {
        reconnectQueuedRef.current = false;
        queueMicrotask(() => void reconnectCheckRef.current?.());
      }
    }
  }

  async function handleCheckTransactionStatus(silent = false): Promise<void> {
    if (
      !accessToken ||
      statusCheckLockRef.current ||
      submissionLockRef.current
    ) {
      return;
    }
    const attempt = pendingAttemptRef.current;
    // Prefer the locally persisted attempt key; a server recovery listing must
    // never silently switch the key of an uncertain client request.
    const key = attempt?.key ?? pendingRecovery?.idempotency_key;
    if (!key) return;

    statusCheckLockRef.current = true;
    if (!silent) {
      setIsCheckingStatus(true);
      setPendingStatusMessage(
        navigator.onLine
          ? 'Checking the transfer status…'
          : 'Offline. The transfer remains saved; status checking will resume when the connection returns.',
      );
    }
    try {
      const result = await getTransactionIdempotencyStatus(accessToken, key);
      if (result.status === 'COMPLETED' && result.transaction) {
        pendingAttemptRef.current = null;
        setPendingAttemptProtocolVersion(null);
        if (userId !== null) clearPendingAttempt(userId);
        setPendingRecovery(null);
        setHasRecoveryKeyConflict(false);
        setIsRetryingUncertain(false);
        setError(null);
        setPendingStatusMessage(null);
        setTransaction(result.transaction);
        try {
          const updatedAccount = await getMyAccount(accessToken);
          setAccount(updatedAccount);
          setAccountError(null);
        } catch (refreshError) {
          setAccountError(
            refreshError instanceof Error
              ? `Transfer completed, but the balance could not be refreshed: ${refreshError.message}`
              : 'Transfer completed, but the balance could not be refreshed.',
          );
        }
        return;
      }

      if (result.status === 'FAILED') {
        pendingAttemptRef.current = null;
        setPendingAttemptProtocolVersion(null);
        if (userId !== null) clearPendingAttempt(userId);
        setPendingRecovery(null);
        setHasRecoveryKeyConflict(false);
        setIsRetryingUncertain(false);
        setError(
          result.failure_code === 'INSUFFICIENT_FUNDS'
            ? 'The previous transfer was not completed because the account had insufficient funds. You can start a new transfer.'
            : `The previous transfer failed (${result.failure_code ?? 'unknown reason'}). You can start a new transfer.`,
        );
        setPendingStatusMessage(null);
        return;
      }

      if (result.status === 'PROCESSING') {
        // PROCESSING is a server-owned operation. Resume it directly with the
        // same key; do not depend on a separate recovery-list lookup succeeding.
        setPendingStatusMessage(
          'The transfer is still processing. Resuming the original operation…',
        );
        submissionLockRef.current = true;
        setIsSubmitting(true);
        try {
          const resumed = await resumeTransaction(accessToken, key);
          if (resumed.status === 'COMPLETED' && resumed.transaction) {
            pendingAttemptRef.current = null;
            setPendingAttemptProtocolVersion(null);
            pendingRequestRef.current = null;
            if (userId !== null) clearPendingAttempt(userId);
            setPendingRecovery(null);
            setHasRecoveryKeyConflict(false);
            setIsRetryingUncertain(false);
            setError(null);
            setPendingStatusMessage(null);
            setTransaction(resumed.transaction);
            try {
              setAccount(await getMyAccount(accessToken));
              setAccountError(null);
            } catch {
              setAccountError(
                'Transfer completed, but the balance could not be refreshed.',
              );
            }
            return;
          }
          if (resumed.status === 'FAILED') {
            pendingAttemptRef.current = null;
            setPendingAttemptProtocolVersion(null);
            pendingRequestRef.current = null;
            if (userId !== null) clearPendingAttempt(userId);
            setPendingRecovery(null);
            setHasRecoveryKeyConflict(false);
            setIsRetryingUncertain(false);
            setPendingStatusMessage(null);
            setError(
              `The original transfer failed (${resumed.failure_code ?? 'unknown reason'}). You can start a new transfer.`,
            );
            return;
          }
          setPendingStatusMessage(
            'The original transfer is still processing. Its key and recovery record remain saved.',
          );
        } catch {
          setPendingStatusMessage(
            'The original transfer could not be resumed yet. Its key remains saved; check again when the connection is stable.',
          );
        } finally {
          submissionLockRef.current = false;
          setIsSubmitting(false);
        }
        return;
      }

      if (result.status === 'NOT_FOUND' && attempt?.protocolVersion === 2) {
        const pending = await getPendingTransactionRecovery(accessToken);
        if (pending.operation) {
          // Do not replace the local key with a different server operation.
          if (pending.operation.idempotency_key === attempt.key) {
            setHasRecoveryKeyConflict(false);
            setPendingRecovery(pending.operation);
            setPendingStatusMessage(
              'The original transfer is available for server-side recovery.',
            );
          } else {
            setHasRecoveryKeyConflict(true);
            setPendingStatusMessage(
              'A different transfer is pending on the server. The original attempt remains locked; resolve the server-side transfer first.',
            );
          }
          setIsRetryingUncertain(true);
          return;
        }

        const originalRequest =
          pendingRequestRef.current ?? attempt.request ?? null;
        if (originalRequest) {
          // Replay only the exact request body and key from the ambiguous
          // attempt. Lock synchronously so the form cannot submit concurrently.
          submissionLockRef.current = true;
          setIsSubmitting(true);
          setPendingStatusMessage(
            'No result is recorded yet. Retrying the exact same transfer with its original key…',
          );
          try {
            const replayed = await createTransaction(
              accessToken,
              originalRequest,
              attempt.key,
            );
            pendingAttemptRef.current = null;
            setPendingAttemptProtocolVersion(null);
            pendingRequestRef.current = null;
            if (userId !== null) clearPendingAttempt(userId);
            setPendingRecovery(null);
            setHasRecoveryKeyConflict(false);
            setIsRetryingUncertain(false);
            setError(null);
            setPendingStatusMessage(null);
            setTransaction(replayed);
            try {
              setAccount(await getMyAccount(accessToken));
              setAccountError(null);
            } catch {
              setAccountError(
                'Transfer completed, but the balance could not be refreshed.',
              );
            }
          } catch (replayError) {
            setIsRetryingUncertain(true);
            setError(AMBIGUOUS_TRANSACTION_MESSAGE);
            setPendingStatusMessage(
              replayError instanceof ApiClientError &&
                !replayError.outcomeUnknown
                ? 'The retry was rejected. The original key remains saved; check status before trying again.'
                : 'The retry outcome is still unknown. The same key and request remain saved; check status again.',
            );
          } finally {
            submissionLockRef.current = false;
            setIsSubmitting(false);
          }
          return;
        }

        // After a reload, the request body is intentionally not persisted.
        // Keep the attempt and let the user re-enter the exact same details;
        // handleTransaction validates the signature and reuses this key.
        setIsRetryingUncertain(true);
        setPendingStatusMessage(
          'This saved attempt predates request recovery in this version. Re-enter the exact same recipient, amount and reference once; the original key will be reused.',
        );
        return;
      }

      // NOT_FOUND for a legacy transaction-key-only request is not proof of
      // failure. Keep it locked until it is reconciled with account history.
      setPendingStatusMessage(
        'No completed transaction was found. This older request cannot be safely declared failed from this response alone. Keep the original key and do not start another transfer until reconciled.',
      );
    } catch {
      setPendingStatusMessage(
        navigator.onLine
          ? 'The transfer status could not be retrieved. The previous attempt remains saved; automatic checking will retry shortly.'
          : 'Offline. The previous transfer remains saved; automatic status checking will resume when the connection returns.',
      );
    } finally {
      statusCheckLockRef.current = false;
      if (!silent) setIsCheckingStatus(false);
      if (reconnectQueuedRef.current) {
        reconnectQueuedRef.current = false;
        queueMicrotask(() => void reconnectCheckRef.current?.());
      }
    }
  }

  async function handleResumeOriginalTransfer(): Promise<void> {
    if (!accessToken || !pendingRecovery || isSubmitting) return;
    const localAttempt = pendingAttemptRef.current;
    if (
      localAttempt?.key &&
      localAttempt.key !== pendingRecovery.idempotency_key
    ) {
      setHasRecoveryKeyConflict(true);
      setError(
        'The server recovery key conflicts with the saved transfer attempt. Do not resume either transfer until the conflict is reconciled.',
      );
      setIsRetryingUncertain(true);
      return;
    }
    submissionLockRef.current = true;
    setIsSubmitting(true);
    setError(null);
    setPendingStatusMessage('Resuming the original transfer safely…');
    try {
      const result = await resumeTransaction(
        accessToken,
        pendingRecovery.idempotency_key,
      );
      if (result.status === 'COMPLETED' && result.transaction) {
        pendingAttemptRef.current = null;
        setPendingAttemptProtocolVersion(null);
        if (userId !== null) clearPendingAttempt(userId);
        setPendingRecovery(null);
        setHasRecoveryKeyConflict(false);
        setIsRetryingUncertain(false);
        setPendingStatusMessage(null);
        setTransaction(result.transaction);
        try {
          setAccount(await getMyAccount(accessToken));
          setAccountError(null);
        } catch {
          setAccountError(
            'Transfer completed, but the balance could not be refreshed.',
          );
        }
        return;
      }
      if (result.status === 'FAILED') {
        pendingAttemptRef.current = null;
        setPendingAttemptProtocolVersion(null);
        if (userId !== null) clearPendingAttempt(userId);
        setPendingRecovery(null);
        setHasRecoveryKeyConflict(false);
        setIsRetryingUncertain(false);
        setPendingStatusMessage(null);
        setError(
          result.failure_code === 'INSUFFICIENT_FUNDS'
            ? 'The original transfer failed because there were insufficient funds. You can now start a new transfer.'
            : `The original transfer failed (${result.failure_code ?? 'unknown reason'}). You can now start a new transfer.`,
        );
        return;
      }
      setPendingStatusMessage(
        'The original transfer is still pending. Its saved details remain available; check again shortly.',
      );
    } catch (resumeError) {
      setPendingStatusMessage(
        resumeError instanceof Error
          ? `${resumeError.message} The original transfer remains saved; retry it using the same recovery action.`
          : 'The original transfer could not be resumed. Its saved details remain available; try again.',
      );
      try {
        const refreshed = await getPendingTransactionRecovery(accessToken);
        setPendingRecovery(refreshed.operation);
      } catch {
        // Do not clear the locally rendered recovery details on lookup failure.
      }
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleTransaction(
    recipientMethod: 'iban' | 'email',
    destination: string,
    amount: string,
    reference: string | null,
  ): Promise<void> {
    if (pendingRecovery) {
      setError('Resolve the previous transfer before starting a new one.');
      return;
    }

    if (!accessToken) {
      setError('Not authenticated.');
      return;
    }

    if (userId === null) {
      setError('Your account details are still loading. Please try again.');
      return;
    }

    // This ref changes synchronously, unlike React state. A second submit
    // cannot start another request while the first request is in flight.
    if (submissionLockRef.current) {
      return;
    }

    const request: TransactionCreateRequest = {
      ...(recipientMethod === 'iban'
        ? { destination_iban: destination }
        : { destination_email: destination.toLowerCase() }),
      amount,
      reference: reference?.trim() || null,
    };

    const signature = requestSignature(request);
    const existingAttempt = pendingAttemptRef.current;

    // An uncertain request must be retried with exactly the same payload.
    if (existingAttempt && existingAttempt.signature !== signature) {
      setError(DIFFERENT_TRANSACTION_BLOCK_MESSAGE);
      setIsRetryingUncertain(true);
      return;
    }

    let idempotencyKey: string;

    try {
      idempotencyKey = existingAttempt?.key ?? generateIdempotencyKey();
    } catch (keyError) {
      setError(
        keyError instanceof Error
          ? keyError.message
          : 'Unable to prepare a secure transaction request.',
      );
      return;
    }

    const attempt = {
      key: idempotencyKey,
      signature,
      protocolVersion: 2 as const,
      request,
    };

    pendingAttemptRef.current = attempt;
    setPendingAttemptProtocolVersion(2);
    pendingRequestRef.current = request;
    autoRecoveryStartedRef.current = false;
    storePendingAttempt(userId, attempt);

    setIsRetryingUncertain(Boolean(existingAttempt));

    // Set the lock before the first await so rapid clicks cannot start
    // parallel requests before React has rendered the disabled button.
    submissionLockRef.current = true;
    setIsSubmitting(true);
    setError(null);
    setPendingStatusMessage(null);
    setTransaction(null);

    const submissionController = new AbortController();
    activeSubmissionControllerRef.current = submissionController;

    try {
      const createdTransaction = await createTransaction(
        accessToken,
        request,
        idempotencyKey,
        submissionController.signal,
      );

      // The API response confirms the result. Clear the pending key before
      // refreshing unrelated UI data so a refresh error cannot be mistaken
      // for an uncertain transaction outcome.
      pendingAttemptRef.current = null;
      setPendingAttemptProtocolVersion(null);
      pendingRequestRef.current = null;
      clearPendingAttempt(userId);
      setPendingRecovery(null);
      setHasRecoveryKeyConflict(false);

      setIsRetryingUncertain(false);
      setTransaction(createdTransaction);
    } catch (submissionError) {
      const outcomeUnknown =
        submissionError instanceof ApiClientError &&
        (submissionError.outcomeUnknown ||
          submissionError.status === 409 ||
          submissionError.status === 425);

      if (
        submissionError instanceof ApiClientError &&
        submissionError.status === 409
      ) {
        try {
          const pending = await getPendingTransactionRecovery(accessToken);
          if (pending.operation) {
            const localAttempt = pendingAttemptRef.current;
            if (
              localAttempt?.key &&
              localAttempt.key !== pending.operation.idempotency_key
            ) {
              setHasRecoveryKeyConflict(true);
              // A 409 may describe a different server-owned operation. Preserve
              // the exact client attempt and its payload; do not expose the
              // conflicting operation as resumable recovery UI.
              setPendingRecovery(null);
              setIsRetryingUncertain(true);
              setError(
                'A different transfer is awaiting confirmation on the server. The original attempt was preserved; resolve the key conflict before retrying.',
              );
              setPendingStatusMessage(
                'The server recovery key differs from this request. No transfer was resumed and the saved idempotency key was not replaced.',
              );
            } else {
              setHasRecoveryKeyConflict(false);
              setPendingRecovery(pending.operation);
              const serverAttempt: PendingTransactionAttempt = {
                key: pending.operation.idempotency_key,
                signature: localAttempt?.signature ?? '',
                protocolVersion: 2,
                ...(localAttempt?.request
                  ? { request: localAttempt.request }
                  : {}),
              };
              pendingAttemptRef.current = serverAttempt;
              setPendingAttemptProtocolVersion(2);
              storePendingAttempt(userId, serverAttempt);
              setIsRetryingUncertain(true);
              setPendingStatusMessage(
                'The server reports a transfer awaiting confirmation. Its original recovery key has been saved.',
              );
            }
            return;
          }
        } catch {
          // Keep the request locked if the conflicting server state cannot be read.
        }
      }

      if (outcomeUnknown) {
        // Keep the key and signature so the same request can be retried.
        setIsRetryingUncertain(true);
        setError(AMBIGUOUS_TRANSACTION_MESSAGE);
        setPendingStatusMessage(
          connectionLostRef.current || !navigator.onLine
            ? 'Transfer status unknown – connection lost. The original attempt is saved. We will check it automatically when the connection returns; do not start another transfer.'
            : 'The transfer result is not confirmed yet. The original attempt is saved. We will check it automatically when the request times out or the connection returns; do not start another transfer.',
        );
        // Do not await a second network request while handling an ambiguous
        // mutation. Release the submit lock promptly; the serialized recovery
        // loop will query status as soon as this request settles.
      } else {
        // The server returned a definite error. This attempt can be cleared.
        pendingAttemptRef.current = null;
        setPendingAttemptProtocolVersion(null);
        pendingRequestRef.current = null;
        clearPendingAttempt(userId);

        setIsRetryingUncertain(false);
        setPendingStatusMessage(null);
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : 'Unable to process transaction.',
        );
      }

      return;
    } finally {
      if (activeSubmissionControllerRef.current === submissionController) {
        activeSubmissionControllerRef.current = null;
      }
      submissionLockRef.current = false;
      setIsSubmitting(false);
      if (reconnectQueuedRef.current) {
        reconnectQueuedRef.current = false;
        queueMicrotask(() => void reconnectCheckRef.current?.());
      }
    }

    // The transfer has already been confirmed. A balance refresh failure
    // must not change the transfer's confirmed status.
    try {
      const updatedAccount = await getMyAccount(accessToken);

      setAccount(updatedAccount);
      setAccountError(null);
    } catch (accountRefreshError) {
      setAccountError(
        accountRefreshError instanceof Error
          ? `Transfer completed, but the balance could not be refreshed: ${accountRefreshError.message}`
          : 'Transfer completed, but the balance could not be refreshed.',
      );
    }
  }

  async function handleCopy(field: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);

      window.setTimeout(() => {
        setCopiedField((currentField) =>
          currentField === field ? null : currentField,
        );
      }, 2000);
    } catch {
      setCopiedField(null);
    }
  }

  function handleStartNewTransfer(): void {
    // A new form may only be opened after the previous attempt is confirmed.
    // Never clear a saved idempotency key or server recovery operation here.
    if (pendingAttemptRef.current?.key || pendingRecovery) {
      setError(
        'The previous transfer is still unresolved. Check its status before starting another transfer.',
      );
      setIsRetryingUncertain(true);
      return;
    }

    // Reset the same transient recovery state used by a fresh transfer flow.
    // The next submit still goes through handleTransaction and its normal
    // idempotency/reconnection handling.
    autoRecoveryStartedRef.current = false;
    connectionLostRef.current = false;
    reconnectQueuedRef.current = false;
    activeSubmissionControllerRef.current = null;

    setTransaction(null);
    setError(null);
    setIsRetryingUncertain(false);
    setPendingStatusMessage(null);
    setPendingRecovery(null);
    setHasRecoveryKeyConflict(false);
    setRecoveryLookupFailed(false);
  }

  function changeMode(nextMode: TransactionMode): void {
    setMode(nextMode);
    // Keep a confirmed result visible when the user returns to Send Money.
    // Starting a new transfer is an explicit action in the confirmation view.
    setError(null);
  }

  function getTabClass(tab: TransactionMode): string {
    return `rounded-lg px-4 py-2.5 text-sm font-medium transition sm:px-5 ${
      mode === tab
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30'
        : 'text-slate-400 hover:text-white'
    }`;
  }

  // Keep recovery callbacks current without re-registering timers/listeners.
  useEffect(() => {
    reconnectCheckRef.current = async () => {
      if (!accessToken) return;
      if (!navigator.onLine) {
        setPendingStatusMessage(
          'Offline. The previous transfer remains saved; automatic status checking will resume when the connection returns.',
        );
        return;
      }
      if (submissionLockRef.current || statusCheckLockRef.current) {
        reconnectQueuedRef.current = true;
        return;
      }

      if (pendingRecovery?.idempotency_key || pendingAttemptRef.current?.key) {
        await handleCheckTransactionStatus(true);
        return;
      }

      if (isRetryingUncertain || recoveryLookupFailed) {
        await handleRefreshRecovery();
      }
    };
  });

  // Detect API/network failures even when the browser still reports online
  // (for example, Wi-Fi connected but router/DNS/backend unreachable). While
  // the initial mutation is pending, use bounded exponential backoff rather
  // than a fixed rapid interval. This probe never creates/retries a transfer.
  useEffect(() => {
    if (!accessToken || !isSubmitting || !pendingAttemptRef.current?.key) {
      return;
    }

    // One immediate probe, then exponential backoff capped at 30s. The
    // health endpoint itself has a 2s timeout, and probes are serialized.
    const delaysMs = [2000, 4000, 8000, 15000, 30000] as const;
    let delayIndex = 0;
    let timerId: number | undefined;
    let probeInFlight = false;
    let cancelled = false;

    const scheduleNext = (): void => {
      if (cancelled) return;
      const delay = delaysMs[Math.min(delayIndex, delaysMs.length - 1)];
      delayIndex = Math.min(delayIndex + 1, delaysMs.length - 1);
      timerId = window.setTimeout(() => void probeConnection(), delay);
    };

    const probeConnection = async (): Promise<void> => {
      if (cancelled) return;
      if (!navigator.onLine) {
        scheduleNext();
        return;
      }
      if (probeInFlight) {
        scheduleNext();
        return;
      }
      probeInFlight = true;
      try {
        await getHealth();
        if (connectionLostRef.current) {
          connectionLostRef.current = false;
          delayIndex = 0;
          setPendingStatusMessage(
            'Connection restored. The previous transfer is being checked…',
          );
          if (!submissionLockRef.current && !statusCheckLockRef.current) {
            void reconnectCheckRef.current?.();
          } else {
            reconnectQueuedRef.current = true;
          }
        }
      } catch {
        // A failed health probe is not proof the transfer failed. Preserve the
        // attempt and abort only the client wait so reconciliation can proceed.
        if (submissionLockRef.current && pendingAttemptRef.current?.key) {
          connectionLostRef.current = true;
          setIsRetryingUncertain(true);
          setError(AMBIGUOUS_TRANSACTION_MESSAGE);
          setPendingStatusMessage(
            'Transfer status unknown – connection lost or API unreachable. The original attempt is saved; automatic checking will resume when the connection returns.',
          );
          activeSubmissionControllerRef.current?.abort();
        }
      } finally {
        probeInFlight = false;
        scheduleNext();
      }
    };

    // Probe immediately when a transfer starts. If the health probe fails,
    // abort only the client wait and enter idempotent reconciliation. If the
    // health endpoint remains reachable but this POST hangs, createTransaction
    // has its own 8s timeout. Backoff prevents chatty health polling.
    void probeConnection();
    return () => {
      cancelled = true;
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [accessToken, isSubmitting]);

  // Reconcile automatically while an attempt is unresolved. Use bounded
  // backoff (3s, 5s, 10s, 20s, then 30s) instead of fixed-rate polling. The
  // online event still triggers an immediate check, and requests are serialized.
  useEffect(() => {
    if (
      !accessToken ||
      isLoadingRecovery ||
      (!isRetryingUncertain && !pendingRecovery)
    ) {
      return;
    }

    if (!autoRecoveryStartedRef.current) {
      autoRecoveryStartedRef.current = true;
      void reconnectCheckRef.current?.();
    }

    const delaysMs = [3000, 5000, 10000, 20000, 30000] as const;
    let delayIndex = 0;
    let timerId: number | undefined;
    let cancelled = false;

    const scheduleNext = (): void => {
      if (cancelled) return;
      const delay = delaysMs[Math.min(delayIndex, delaysMs.length - 1)];
      delayIndex = Math.min(delayIndex + 1, delaysMs.length - 1);
      timerId = window.setTimeout(() => {
        if (cancelled) return;
        if (!navigator.onLine) {
          setPendingStatusMessage(
            'Offline. The previous transfer remains saved; automatic status checking will resume when the connection returns.',
          );
        } else if (
          !submissionLockRef.current &&
          !statusCheckLockRef.current &&
          !isSubmitting
        ) {
          void reconnectCheckRef.current?.();
        }
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [
    accessToken,
    isLoadingRecovery,
    isRetryingUncertain,
    pendingRecovery,
    isSubmitting,
  ]);

  useEffect(() => {
    if (!accessToken) return;

    const handleConnectionRestored = (): void => {
      connectionLostRef.current = false;
      if (pendingAttemptRef.current?.key || pendingRecovery?.idempotency_key) {
        setPendingStatusMessage(
          'Connection restored. Checking the previous transfer…',
        );
      }
      void reconnectCheckRef.current?.();
    };
    const handleConnectionLost = (): void => {
      connectionLostRef.current = true;
      if (pendingAttemptRef.current?.key || pendingRecovery?.idempotency_key) {
        // Make the unresolved state visible immediately. Do not wait for the
        // in-flight fetch to reject: browsers may keep it pending after the
        // offline event, and the user must see the recovery message at once.
        setIsRetryingUncertain(true);
        setError(AMBIGUOUS_TRANSACTION_MESSAGE);
        setPendingStatusMessage(
          'Transfer status unknown – connection lost. The original attempt is saved; automatic status checking will resume when the connection returns.',
        );
        // Stop waiting on the in-flight POST immediately. Aborting the client
        // request does not cancel a server-side transfer; its outcome remains
        // unknown and is reconciled with the same idempotency key. The 8s
        // request timeout remains only a fallback when no offline event fires.
        activeSubmissionControllerRef.current?.abort();
      }
    };

    window.addEventListener('online', handleConnectionRestored);
    window.addEventListener('offline', handleConnectionLost);
    return () => {
      window.removeEventListener('online', handleConnectionRestored);
      window.removeEventListener('offline', handleConnectionLost);
    };
  }, [accessToken, pendingRecovery]);

  return (
    <section className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Transaction processing
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Transactions
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          Send money, receive money and view your transaction history.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Transaction sections"
        className="flex w-full flex-wrap gap-1 rounded-xl border border-slate-700/80 bg-slate-950/70 p-1 sm:w-fit"
      >
        <button
          type="button"
          role="tab"
          id="transactions-send-tab"
          aria-selected={mode === 'send'}
          aria-controls="transactions-tab-panel"
          onClick={() => changeMode('send')}
          className={getTabClass('send')}
        >
          Send Money
        </button>

        <button
          type="button"
          role="tab"
          id="transactions-receive-tab"
          aria-selected={mode === 'receive'}
          aria-controls="transactions-tab-panel"
          onClick={() => changeMode('receive')}
          className={getTabClass('receive')}
        >
          Receive Money
        </button>

        <button
          type="button"
          role="tab"
          id="transactions-history-tab"
          aria-selected={mode === 'history'}
          aria-controls="transactions-tab-panel"
          onClick={() => changeMode('history')}
          className={getTabClass('history')}
        >
          Transaction History
        </button>
      </div>

      <div
        id="transactions-tab-panel"
        role="tabpanel"
        aria-labelledby={`transactions-${mode}-tab`}
        className="min-w-0"
      >
        {mode === 'history' ? (
          <TransactionHistory
            accessToken={accessToken}
            initialSelectedTransactionId={historyTransactionId}
          />
        ) : mode === 'send' ? (
          transaction ? (
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/80 shadow-2xl shadow-slate-950/30">
                <div className="border-b border-slate-800 bg-emerald-500/[0.04] px-6 py-8 text-center sm:px-10">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path
                        d="m5 12 4 4L19 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                    Transfer completed
                  </p>
                  <h2 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    {formatAmount(transaction.amount)}
                  </h2>
                  <p className="mt-3 text-sm text-slate-400">
                    Your transfer has been confirmed and recorded.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {transaction.status}
                  </span>
                </div>

                <div className="p-6 sm:p-8">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">
                      Transfer receipt
                    </h3>
                    <span className="text-xs text-slate-500">
                      Keep this reference for your records
                    </span>
                  </div>

                  <dl className="mt-5 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40 px-4 sm:px-5">
                    <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                      <dt className="text-sm text-slate-400">Transaction ID</dt>
                      <dd className="font-mono text-sm font-medium text-slate-200">
                        #{transaction.id}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                      <dt className="text-sm text-slate-400">Processed</dt>
                      <dd className="text-sm font-medium text-slate-200">
                        {formatCreatedAt(transaction.created_at)}
                      </dd>
                    </div>
                    {transaction.reference && (
                      <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                        <dt className="text-sm text-slate-400">Reference</dt>
                        <dd className="max-w-md break-words text-sm font-medium text-slate-200 sm:text-right">
                          {transaction.reference}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {accountError && (
                    <p
                      role="status"
                      className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm leading-6 text-amber-200"
                    >
                      {accountError}
                    </p>
                  )}

                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryTransactionId(transaction.id);
                        setMode('history');
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      View transaction history
                    </button>
                    <button
                      type="button"
                      onClick={handleStartNewTransfer}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                      Start new transfer
                    </button>
                  </div>
                </div>
              </section>
              <aside className="h-fit self-start overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/70">
                <div className="p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 3 5 6v5c0 4.5 2.9 8.5 7 10 4.1-1.5 7-5.5 7-10V6l-7-3Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="m9 12 2 2 4-4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h2 className="mt-5 text-base font-semibold text-white">
                    Secure transfer
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Send money securely to another Idemerax account using the
                    recipient&apos;s IBAN or account email.
                  </p>
                  <div className="mt-5 border-t border-slate-800 pt-5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500">Transaction type</span>
                      <span className="font-medium text-slate-200">
                        Transfer
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500">Currency</span>
                      <span className="font-medium text-slate-200">EUR</span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          ) : (
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-5">
                {pendingRecovery ? (
                  <section
                    aria-label="Previous transfer recovery"
                    className="rounded-2xl border border-slate-700 bg-slate-950/70 p-5 sm:p-6"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-base font-semibold text-white">
                        Previous transfer
                      </h2>
                      <span className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-300">
                        Needs confirmation
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Original request restored from the server
                    </p>
                    <dl className="mt-5 space-y-4">
                      <div>
                        <dt className="text-sm font-medium text-slate-300">
                          {pendingRecovery.recipient_method === 'iban'
                            ? 'Recipient IBAN'
                            : 'Recipient email'}
                        </dt>
                        <dd className="mt-2 break-all font-mono text-sm text-white">
                          {pendingRecovery.recipient_iban
                            ? maskIban(pendingRecovery.recipient_iban)
                            : (pendingRecovery.recipient_email ??
                              'Recipient unavailable')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-slate-300">
                          Amount
                        </dt>
                        <dd className="mt-2 text-2xl font-semibold text-white">
                          {formatAmount(pendingRecovery.amount)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-slate-300">
                          Reference
                        </dt>
                        <dd className="mt-2 text-sm text-white">
                          {pendingRecovery.reference || '—'}
                        </dd>
                      </div>
                    </dl>
                    {pendingStatusMessage && (
                      <p
                        role="status"
                        className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm leading-6 text-slate-300"
                      >
                        {pendingStatusMessage}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleResumeOriginalTransfer()}
                      disabled={
                        isSubmitting || !accessToken || hasRecoveryKeyConflict
                      }
                      className="mt-5 flex min-h-11 w-full items-center justify-center rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting
                        ? 'Resuming transfer…'
                        : hasRecoveryKeyConflict
                          ? 'Resolve transfer conflict'
                          : 'Retry original transfer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCheckTransactionStatus()}
                      disabled={
                        isCheckingStatus || isSubmitting || !accessToken
                      }
                      className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCheckingStatus
                        ? 'Checking status…'
                        : 'Check transfer status'}
                    </button>
                    <div className="mt-5 border-t border-slate-800 pt-5">
                      <h3 className="text-sm font-semibold text-white">
                        New transfer
                      </h3>
                      <p className="mt-2 text-sm text-slate-400">
                        Available after the previous transfer has been safely
                        resolved.
                      </p>
                      <button
                        type="button"
                        disabled
                        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-500"
                      >
                        Start new transfer
                      </button>
                    </div>
                  </section>
                ) : recoveryLookupFailed ? (
                  <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-5">
                    <h2 className="text-base font-semibold text-amber-100">
                      Transfer status cannot be verified
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Idemerax could not check the server for an unfinished
                      transfer. A new transfer is disabled until this check
                      succeeds. No transfer is assumed to have failed.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void (pendingAttemptRef.current?.key
                          ? handleCheckTransactionStatus()
                          : handleRefreshRecovery())
                      }
                      disabled={isCheckingStatus || isSubmitting}
                      className="mt-4 min-h-10 rounded-full border border-amber-500/30 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50"
                    >
                      {isCheckingStatus ? 'Checking…' : 'Check again'}
                    </button>
                  </section>
                ) : isRetryingUncertain &&
                  !pendingRecovery &&
                  pendingAttemptProtocolVersion !== 2 ? (
                  <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-5">
                    <h2 className="text-base font-semibold text-amber-100">
                      Previous transfer needs reconciliation
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      This attempt was created before server-side recovery was
                      available. Its original recipient and amount were not
                      saved on the server, so they cannot be restored safely.
                      Check transaction history and account activity before
                      starting another transfer.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCheckTransactionStatus()}
                      disabled={isCheckingStatus || !accessToken}
                      className="mt-4 min-h-10 rounded-full border border-amber-500/30 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50"
                    >
                      {isCheckingStatus ? 'Checking…' : 'Check transfer status'}
                    </button>
                    <button
                      type="button"
                      disabled
                      className="mt-4 flex min-h-11 w-full items-center justify-center rounded-full bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-500"
                    >
                      Start new transfer
                    </button>
                  </section>
                ) : isLoadingRecovery ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
                    Checking for a previous transfer…
                  </div>
                ) : (
                  <>
                    {isRetryingUncertain &&
                      !pendingRecovery &&
                      pendingAttemptProtocolVersion === 2 && (
                        <section
                          className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-5"
                          aria-label="Pending transfer status"
                        >
                          <h2 className="text-base font-semibold text-amber-100">
                            Transfer status being reconciled
                          </h2>
                          <p
                            role="status"
                            className="mt-2 text-sm leading-6 text-slate-300"
                          >
                            {pendingStatusMessage ||
                              AMBIGUOUS_TRANSACTION_MESSAGE}
                          </p>
                          <button
                            type="button"
                            onClick={() => void handleCheckTransactionStatus()}
                            disabled={
                              isCheckingStatus || isSubmitting || !accessToken
                            }
                            className="mt-4 min-h-10 rounded-full border border-amber-500/30 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50"
                          >
                            {isCheckingStatus
                              ? 'Checking…'
                              : 'Check transfer status'}
                          </button>
                        </section>
                      )}
                    <TransactionForm
                      key="new-transfer"
                      accessToken={accessToken}
                      isSubmitting={isSubmitting}
                      error={error}
                      isRetryingUncertain={isRetryingUncertain}
                      onSubmit={handleTransaction}
                      availableBalance={
                        accessToken ? (account?.balance ?? null) : null
                      }
                      isLoadingBalance={
                        Boolean(accessToken) && isLoadingAccount
                      }
                    />
                  </>
                )}

                {(!accessToken || accountError) && !transaction && (
                  <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
                    {!accessToken ? 'Not authenticated.' : accountError}
                  </p>
                )}
              </div>

              <aside className="h-fit self-start overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/70">
                <div className="p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 3 5 6v5c0 4.5 2.9 8.5 7 10 4.1-1.5 7-5.5 7-10V6l-7-3Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="m9 12 2 2 4-4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h2 className="mt-5 text-base font-semibold text-white">
                    Secure transfer
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Send money securely to another Idemerax account using the
                    recipient&apos;s IBAN or account email.
                  </p>
                  <div className="mt-5 border-t border-slate-800 pt-5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500">Transaction type</span>
                      <span className="font-medium text-slate-200">
                        Transfer
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500">Currency</span>
                      <span className="font-medium text-slate-200">EUR</span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )
        ) : (
          <section className="max-w-3xl overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/70 shadow-xl shadow-slate-950/20">
            <div className="border-b border-slate-800 px-6 py-6 sm:px-8">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M12 3v18M5 8h14M5 16h14" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Receive Money
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-slate-400">
                    Share one of the following details with someone who wants to
                    send money to your Idemerax account.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-6 sm:p-8">
              {!accessToken ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
                  Not authenticated.
                </div>
              ) : isLoadingAccount || isLoadingUser ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
                  Loading your payment details…
                </div>
              ) : accountError || userError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-300"
                >
                  {accountError ?? userError}
                </div>
              ) : accessToken && account && userEmail ? (
                <>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          IBAN
                        </p>
                        <p className="mt-2 break-all font-mono text-sm leading-6 text-slate-200">
                          {formatIban(account.iban)}
                        </p>
                      </div>
                      <CopyButton
                        value={account.iban}
                        label="IBAN"
                        copiedField={copiedField}
                        onCopy={handleCopy}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          BIC
                        </p>
                        <p className="mt-2 break-all font-mono text-sm leading-6 text-slate-200">
                          {account.bic}
                        </p>
                      </div>
                      <CopyButton
                        value={account.bic}
                        label="BIC"
                        copiedField={copiedField}
                        onCopy={handleCopy}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Email
                        </p>
                        <p className="mt-2 break-all text-sm leading-6 text-slate-200">
                          {userEmail}
                        </p>
                      </div>
                      <CopyButton
                        value={userEmail}
                        label="Email"
                        copiedField={copiedField}
                        onCopy={handleCopy}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
                  No payment details are available.
                </div>
              )}

              <div className="flex items-start gap-3 rounded-xl border border-blue-500/15 bg-blue-500/[0.05] p-4">
                <svg
                  viewBox="0 0 24 24"
                  className="mt-0.5 h-5 w-5 shrink-0 text-blue-300"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
                </svg>
                <p className="text-sm leading-6 text-slate-400">
                  <span className="font-medium text-slate-200">Tip:</span> Share
                  your email address when the sender uses the Email recipient
                  option, or share your IBAN for an IBAN transfer.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </section>
  );
}

export default TransactionsPage;
