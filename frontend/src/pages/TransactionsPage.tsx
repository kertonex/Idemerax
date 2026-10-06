import { useEffect, useState } from 'react';

import { getMyAccount, type Account } from '../features/accounts/api/accounts';
import { getCurrentUser } from '../features/authentication/api/authentication';
import { useAuth } from '../features/authentication/context/useAuth';
import {
  createTransaction,
  type Transaction,
} from '../features/transactions/api/transactions';
import TransactionForm from '../features/transactions/components/TransactionForm';

type TransactionMode = 'send' | 'receive';

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

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        }
      } catch (userLoadingError) {
        if (isMounted) {
          setUserError(
            userLoadingError instanceof Error
              ? userLoadingError.message
              : 'Unable to load account email.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingUser(false);
        }
      }
    }

    void loadAccount();
    void loadUser();

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  async function handleTransaction(
    recipientMethod: 'iban' | 'email',
    destination: string,
    amount: string,
    reference: string | null,
  ): Promise<void> {
    if (!accessToken) {
      setError('Not authenticated.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setTransaction(null);

      const createdTransaction = await createTransaction(accessToken, {
        ...(recipientMethod === 'iban'
          ? { destination_iban: destination }
          : { destination_email: destination.toLowerCase() }),
        amount,
        reference: reference?.trim() || null,
      });

      setTransaction(createdTransaction);

      const updatedAccount = await getMyAccount(accessToken);
      setAccount(updatedAccount);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Unable to process transaction.',
      );
    } finally {
      setIsSubmitting(false);
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
          Send money to another financial account or share your payment details
          to receive a transfer.
        </p>
      </header>

      <div className="inline-flex rounded-xl border border-slate-700/80 bg-slate-950/70 p-1">
        <button
          type="button"
          onClick={() => {
            setMode('send');
            setTransaction(null);
            setError(null);
          }}
          className={`rounded-lg px-5 py-2.5 text-sm font-medium transition ${
            mode === 'send'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30'
              : 'text-slate-400 hover:text-white'
          }`}
          aria-pressed={mode === 'send'}
        >
          Send Money
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('receive');
            setTransaction(null);
            setError(null);
          }}
          className={`rounded-lg px-5 py-2.5 text-sm font-medium transition ${
            mode === 'receive'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30'
              : 'text-slate-400 hover:text-white'
          }`}
          aria-pressed={mode === 'receive'}
        >
          Receive Money
        </button>
      </div>

      {mode === 'send' ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <TransactionForm
                accessToken={accessToken}
                isSubmitting={isSubmitting}
                error={error}
                onSubmit={handleTransaction}
                availableBalance={account?.balance ?? null}
                isLoadingBalance={isLoadingAccount}
              />

              {(!accessToken || accountError) && (
                <p className="mt-3 text-sm text-slate-500">
                  {!accessToken ? 'Not authenticated.' : accountError}
                </p>
              )}
            </div>

            <aside className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/70 p-6 shadow-xl shadow-slate-950/30">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(37,99,235,0.12),transparent_45%)]" />

              <div className="relative">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/15 ring-1 ring-blue-500/20">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 text-blue-400"
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

                <h2 className="mt-5 text-lg font-semibold text-white">
                  Secure transfer
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Send money securely to another Idemerax account using the
                  recipient&apos;s IBAN or account email.
                </p>

                <div className="mt-6 space-y-4 border-t border-slate-800 pt-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-slate-500">
                      Transaction type
                    </span>

                    <span className="text-sm font-medium text-slate-200">
                      Transfer
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-slate-500">Currency</span>

                    <span className="text-sm font-medium text-slate-200">
                      EUR
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {transaction && (
            <section className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/5 shadow-xl shadow-slate-950/20">
              <div className="flex items-start gap-4 p-6 sm:p-7">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/20">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 text-emerald-400"
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

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.15em] text-emerald-400">
                        Transfer completed
                      </p>

                      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                        {formatAmount(transaction.amount)}
                      </p>
                    </div>

                    <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-400 ring-1 ring-emerald-500/20">
                      {transaction.status}
                    </span>
                  </div>

                  {transaction.reference && (
                    <div className="mt-4">
                      <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                        Reference
                      </p>

                      <p className="mt-1 break-words text-sm text-slate-300">
                        {transaction.reference}
                      </p>
                    </div>
                  )}

                  <div className="mt-5 grid gap-4 border-t border-emerald-500/10 pt-5 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                        Transaction ID
                      </p>

                      <p className="mt-1 font-mono text-sm text-slate-300">
                        #{transaction.id}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                        Processed
                      </p>

                      <p className="mt-1 text-sm text-slate-300">
                        {formatCreatedAt(transaction.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="max-w-3xl overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/70 shadow-xl shadow-slate-950/30">
          <div className="relative p-6 sm:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(37,99,235,0.10),transparent_40%)]" />

            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/15 ring-1 ring-blue-500/20">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M12 3v18M5 8h14M5 16h14" strokeLinecap="round" />
                </svg>
              </div>

              <h2 className="mt-5 text-xl font-semibold text-white">
                Receive Money
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Share one of the following details with someone who wants to
                send money to your Idemerax account.
              </p>

              {isLoadingAccount || isLoadingUser ? (
                <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
                  Loading your payment details...
                </div>
              ) : accountError || userError ? (
                <div
                  role="alert"
                  className="mt-8 rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-300"
                >
                  {accountError ?? userError}
                </div>
              ) : account && userEmail ? (
                <div className="mt-8 space-y-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                          IBAN
                        </p>

                        <p className="mt-2 break-all font-mono text-sm text-slate-200">
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

                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                          BIC
                        </p>

                        <p className="mt-2 break-all font-mono text-sm text-slate-200">
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

                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                          Email
                        </p>

                        <p className="mt-2 break-all text-sm text-slate-200">
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
                </div>
              ) : (
                <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
                  No payment details are available.
                </div>
              )}

              <div className="mt-6 rounded-xl border border-blue-500/10 bg-blue-500/5 p-5">
                <p className="text-sm leading-6 text-slate-400">
                  <span className="font-medium text-slate-200">Tip:</span> Share
                  your email address when the sender uses the Email recipient
                  option, or share your IBAN for an IBAN transfer.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

export default TransactionsPage;
