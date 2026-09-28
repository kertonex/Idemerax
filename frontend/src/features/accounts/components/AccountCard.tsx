import { useState } from 'react';

import type { Account } from '../api/accounts';

interface AccountCardProps {
  account: Account;
}

function formatBalance(balance: string): string {
  const amount = Number(balance);

  if (!Number.isFinite(amount)) {
    return '0,00 €';
  }

  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatIban(iban: string): string {
  return iban
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function AccountCard({ account }: AccountCardProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isBicCopied, setIsBicCopied] = useState(false);

  const formattedIban = formatIban(account.iban);

  async function handleCopyIban() {
    try {
      await navigator.clipboard.writeText(account.iban);
      setIsCopied(true);

      window.setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch {
      setIsCopied(false);
    }
  }

  async function handleCopyBic() {
    try {
      await navigator.clipboard.writeText(account.bic);
      setIsBicCopied(true);

      window.setTimeout(() => {
        setIsBicCopied(false);
      }, 2000);
    } catch {
      setIsBicCopied(false);
    }
  }

  return (
    <div className="space-y-5">
      <article className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/80 p-6 shadow-2xl shadow-slate-950/40 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_55%,rgba(37,99,235,0.18),transparent_38%)]" />

        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 ring-1 ring-blue-500/20">
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path
                    d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 18h18M4 7l8-4 8 4v2H4V7Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-white">
                    Your Financial Account
                  </h2>

                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/20">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Active
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-400">
                  Your account is ready for secure transactions.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <p className="text-sm font-medium text-slate-400">
                Available Balance
              </p>

              <p className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {formatBalance(account.balance)}
              </p>

              <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                EUR
              </p>
            </div>
          </div>

          <div className="pointer-events-none hidden items-center justify-center lg:flex">
            <svg
              viewBox="0 0 240 180"
              className="h-44 w-56 text-blue-400/80"
              fill="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id="bank-gradient"
                  x1="40"
                  y1="20"
                  x2="190"
                  y2="160"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="currentColor" stopOpacity="0.9" />
                  <stop
                    offset="1"
                    stopColor="currentColor"
                    stopOpacity="0.25"
                  />
                </linearGradient>
              </defs>

              <path
                d="m32 62 88-38 88 38-88 38-88-38Z"
                fill="url(#bank-gradient)"
                opacity="0.75"
              />

              <path
                d="M51 70v55m34-55v55m34-55v55m34-55v55"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap="round"
                opacity="0.65"
              />

              <path
                d="M39 130h162M48 145h144"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                opacity="0.5"
              />

              <path
                d="m28 61 92-40 92 40"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </article>

      <section className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/70 shadow-xl shadow-slate-950/30">
        <div className="border-b border-slate-800 px-6 py-5 sm:px-7">
          <h3 className="text-lg font-semibold text-white">Account Details</h3>
        </div>

        <div className="divide-y divide-slate-800">
          <div className="grid gap-2 px-6 py-4 sm:grid-cols-[120px_1fr] sm:px-7">
            <span className="text-sm font-medium text-slate-400">
              Account Type
            </span>

            <span className="text-sm text-slate-200">Personal</span>
          </div>

          <div className="grid gap-2 px-6 py-4 sm:grid-cols-[120px_1fr_auto] sm:items-center sm:px-7">
            <span className="text-sm font-medium text-slate-400">IBAN</span>

            <span className="break-all font-mono text-sm tracking-wide text-slate-200 sm:break-normal">
              {formattedIban}
            </span>

            <button
              type="button"
              onClick={handleCopyIban}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-500/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              aria-label={isCopied ? 'IBAN copied' : 'Copy IBAN'}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <rect width="13" height="13" x="8" y="8" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
              </svg>

              {isCopied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="grid gap-2 px-6 py-4 sm:grid-cols-[120px_1fr_auto] sm:items-center sm:px-7">
            <span className="text-sm font-medium text-slate-400">BIC</span>

            <span className="font-mono text-sm tracking-wide text-slate-200">
              {account.bic}
            </span>

            <button
              type="button"
              onClick={handleCopyBic}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-500/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              aria-label={isBicCopied ? 'BIC copied' : 'Copy BIC'}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <rect width="13" height="13" x="8" y="8" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
              </svg>

              {isBicCopied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="grid gap-2 px-6 py-4 sm:grid-cols-[120px_1fr] sm:px-7">
            <span className="text-sm font-medium text-slate-400">Currency</span>

            <span className="text-sm text-slate-200">EUR - Euro</span>
          </div>

          <div className="grid gap-2 px-6 py-4 sm:grid-cols-[120px_1fr] sm:px-7">
            <span className="text-sm font-medium text-slate-400">Status</span>

            <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Active
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AccountCard;
