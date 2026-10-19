import { useState, type FormEvent } from 'react';

import type { Account } from '../../accounts/api/accounts';

interface CreateCardDialogProps {
  accounts: Account[];
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (accountId: number) => Promise<void>;
}

function CreateCardDialog({
  accounts,
  isSubmitting,
  error,
  onClose,
  onCreate,
}: CreateCardDialogProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    accounts[0]?.id ?? null,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedAccountId === null) {
      return;
    }
    await onCreate(selectedAccountId);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="create-card-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#0a1827] p-5 shadow-2xl sm:p-7"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Card management
            </p>
            <h2
              id="create-card-title"
              className="mt-2 text-xl font-semibold text-white"
            >
              Create virtual card
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Your demo debit card will be linked to the selected financial
              account.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close create card dialog"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            disabled={isSubmitting}
            onClick={onClose}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m6 6 12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <fieldset
            className="space-y-3"
            disabled={isSubmitting || accounts.length === 0}
          >
            <legend className="mb-3 text-sm font-medium text-slate-200">
              Select a financial account
            </legend>
            {accounts.map((account) => (
              <label
                key={account.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                  selectedAccountId === account.id
                    ? 'border-cyan-400/60 bg-cyan-400/5'
                    : 'border-slate-700 bg-slate-900/60 hover:border-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="account"
                  value={account.id}
                  checked={selectedAccountId === account.id}
                  onChange={() => setSelectedAccountId(account.id)}
                  className="mt-1 accent-cyan-400"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">
                      Idemerax account ···· {account.account_number.slice(-4)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-emerald-300">
                      {Number(account.balance).toLocaleString('en-IE', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </span>
                  </span>
                  <span className="mt-1 block break-all font-mono text-xs text-slate-400">
                    {account.iban.replace(/(.{4})/g, '$1 ').trim()}
                  </span>
                </span>
              </label>
            ))}
            {accounts.length === 0 && (
              <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
                No financial account is available. Create an account before
                ordering a card.
              </p>
            )}
          </fieldset>

          <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-[#123b57] to-[#087e83]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-cyan-100"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="2"
                    y="4"
                    width="20"
                    height="16"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  Virtual demo debit card
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  No full card number, CVV, or real payment capability.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedAccountId === null}
              className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Creating card…' : 'Create virtual card'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default CreateCardDialog;
