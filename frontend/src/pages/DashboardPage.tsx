import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';

import AppIcon, { type AppIconName } from '../components/icons/AppIcon';
import { useAuth } from '../features/authentication/context/useAuth';
import {
  getDashboardOverview,
  type DashboardAccount,
  type DashboardOverview,
  type DashboardTransaction,
} from '../features/dashboard/api/dashboard';

function formatMoney(
  value: string | number,
  currency: 'EUR' = 'EUR',
  language = 'en',
): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return '—';
  }

  const formatted = new Intl.NumberFormat(getLocale(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${formatted} ${currency === 'EUR' ? '€' : currency}`;
}

function getLocale(language: string): string {
  return language.toLowerCase().startsWith('de') ? 'de-DE' : 'en-GB';
}

function formatCurrentDate(language: string): string {
  return new Intl.DateTimeFormat(getLocale(language), {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function transactionStatusClass(status: string): string {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
    case 'FAILED':
    case 'REJECTED':
      return 'border-red-500/20 bg-red-500/10 text-red-400';
    case 'PROCESSING':
    case 'PENDING':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-400';
    default:
      return 'border-slate-700 bg-slate-800/70 text-slate-300';
  }
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  iconClass,
}: {
  label: string;
  value: number;
  detail: string;
  icon: AppIconName;
  iconClass: string;
}) {
  return (
    <article className="group relative flex min-w-0 items-center gap-4 overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/95 via-slate-900/80 to-slate-950/90 p-4 shadow-[0_12px_32px_-20px_rgba(0,0,0,0.8)] transition duration-300 hover:-translate-y-0.5 hover:border-blue-400/35 hover:shadow-[0_18px_38px_-22px_rgba(37,99,235,0.28)] sm:p-5 before:pointer-events-none before:absolute before:inset-x-5 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent">
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/10 shadow-inner shadow-white/[0.03] transition-transform duration-300 group-hover:scale-105 ${iconClass}`}
      >
        <AppIcon name={icon} className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-white">
          {value}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
      </div>
    </article>
  );
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
      <h2 className="text-base font-semibold text-white sm:text-lg">{title}</h2>
      {action}
    </div>
  );
}

function AccountRow({
  account,
  currency,
  language,
}: {
  account: DashboardAccount;
  currency: 'EUR';
  language: string;
}) {
  return (
    <div className="group flex min-w-0 items-center gap-3 rounded-xl border border-slate-800/80 bg-gradient-to-r from-slate-950/65 to-slate-900/45 p-3.5 transition duration-200 hover:border-blue-400/25 hover:from-slate-900/80 hover:to-blue-950/20 sm:p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20 transition group-hover:bg-blue-500/15">
        <AppIcon name="accounts" className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-100">
          {`Idemerax ···· ${account.account_number_suffix}`}
        </p>
        <p className="mt-1 truncate text-xs text-slate-500">
          {account.masked_iban}
        </p>
      </div>
      <p className="shrink-0 text-right text-sm font-semibold text-white">
        {formatMoney(account.balance, currency, language)}
      </p>
    </div>
  );
}

function formatTransactionAmount(
  value: string,
  direction: 'incoming' | 'outgoing',
  currency: 'EUR' = 'EUR',
  language = 'en',
): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return '—';
  }

  const formatted = new Intl.NumberFormat(getLocale(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Math.abs(amount));

  return `${direction === 'incoming' ? '+' : '−'}${formatted} ${currency === 'EUR' ? '€' : currency}`;
}

function formatCounterpartyIban(iban: string): string {
  return iban
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function getTransactionCounterparty(
  transaction: DashboardTransaction,
  fallback: string,
): string {
  const name = transaction.counterparty_name?.trim();
  if (name) return name;

  const email = transaction.counterparty_email?.trim();
  if (email) return email;

  const iban = transaction.counterparty_iban?.trim();
  if (iban) return formatCounterpartyIban(iban);

  return fallback;
}

function TransactionRow({
  transaction,
  currency,
  language,
}: {
  transaction: DashboardTransaction;
  currency: 'EUR';
  language: string;
}) {
  const incoming = transaction.direction === 'incoming';
  const counterparty = getTransactionCounterparty(
    transaction,
    'Unknown recipient',
  );
  const amount = formatTransactionAmount(
    transaction.amount,
    transaction.direction,
    currency,
    language,
  );
  const statusLabel = (() => {
    switch (transaction.status.toUpperCase()) {
      case 'COMPLETED':
        return 'Completed';
      case 'FAILED':
        return 'Failed';
      case 'REJECTED':
        return 'Rejected';
      case 'PROCESSING':
        return 'Processing';
      case 'PENDING':
        return 'Pending';
      default:
        return transaction.status.replaceAll('_', ' ');
    }
  })();
  const detailUrl = `/transactions?tab=history&transactionId=${transaction.id}`;

  return (
    <li className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-800/90 bg-gradient-to-r from-slate-950/75 to-slate-900/50 shadow-sm shadow-black/10 transition duration-200 hover:border-blue-400/25 hover:from-slate-900/90 hover:to-blue-950/15">
      <Link
        to={detailUrl}
        aria-label={`${'View details'}: ${counterparty}, ${amount}`}
        className="flex min-h-0 w-full min-w-0 max-w-full flex-row items-start gap-2 overflow-hidden p-2 text-left transition hover:bg-slate-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:items-center sm:gap-2.5 sm:p-2.5"
      >
        <div className="flex min-w-0 max-w-full flex-1 items-start gap-2 sm:gap-2.5">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
              incoming
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-blue-500/10 text-blue-400'
            }`}
            aria-hidden="true"
          >
            <AppIcon
              name={incoming ? 'arrow-down-left' : 'arrow-up-right'}
              className="h-3.5 w-3.5"
            />
          </div>

          <div className="min-w-0 max-w-full flex-1">
            <p className="break-words text-xs font-semibold leading-4 text-white sm:text-[13px]">
              {counterparty}
            </p>

            <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
              {incoming ? 'Incoming transfer' : 'Outgoing transfer'}
            </p>

            <p className="mt-0.5 text-[10px] font-medium leading-3.5 tabular-nums text-slate-500">
              {`Transaction #${transaction.transaction_number}`}
            </p>

            <div className="mt-1 flex min-w-0 max-w-full flex-wrap items-center gap-1">
              <span
                className={`inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium ${
                  transaction.transfer_method === 'iban'
                    ? 'border-blue-500/25 bg-blue-500/10 text-blue-300'
                    : transaction.transfer_method === 'email'
                      ? 'border-violet-500/25 bg-violet-500/10 text-violet-300'
                      : 'border-slate-700 bg-slate-900 text-slate-300'
                }`}
              >
                {transaction.transfer_method === 'iban' ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 10h18M7 15h3" strokeLinecap="round" />
                  </svg>
                ) : transaction.transfer_method === 'email' ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path
                      d="m4 7 8 6 8-6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
                {transaction.transfer_method === 'iban'
                  ? 'IBAN transfer'
                  : transaction.transfer_method === 'email'
                    ? 'Email transfer'
                    : 'Transfer method unavailable'}
              </span>

              <span
                className={`inline-flex max-w-full items-center rounded-full border px-1.5 py-px text-[10px] font-medium ${transactionStatusClass(transaction.status)}`}
              >
                {statusLabel}
              </span>
            </div>

            {transaction.reference?.trim() ? (
              <div className="mt-0.5 flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1 text-[10px] leading-3.5">
                <span className="shrink-0 text-slate-500">{'Reference'}:</span>
                <span className="min-w-0 whitespace-normal break-all text-slate-400">
                  {transaction.reference.trim()}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex w-auto min-w-0 shrink-0 flex-col items-end justify-start gap-1 border-0 pt-0 text-right sm:ml-2 sm:justify-center">
          <p
            className={`max-w-full whitespace-nowrap text-right text-xs font-semibold tabular-nums sm:text-sm ${
              incoming ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {amount}
          </p>

          <div className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-slate-400 transition hover:text-slate-200">
            <span className="hidden sm:inline">{'View details'}</span>
            <AppIcon name="arrow-up-right" className="h-3.5 w-3.5" />
          </div>
        </div>
      </Link>
    </li>
  );
}

function CashFlowCard({
  cashFlow,
  currency,
  language,
}: {
  cashFlow: DashboardOverview['monthly_cash_flow'];
  currency: 'EUR';
  language: string;
}) {
  const moneyIn = Number(cashFlow.money_in);
  const moneyOut = Number(cashFlow.money_out);
  const net = Number(cashFlow.net_movement);
  const valid = [moneyIn, moneyOut, net].every(Number.isFinite);
  const month = new Intl.DateTimeFormat(getLocale(language), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(cashFlow.period_start));
  return (
    <section className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/90 via-slate-900/75 to-slate-950/80 p-5 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.9)] before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <SectionTitle title={'Monthly overview'} />
          <p className="-mt-2 text-xs capitalize text-slate-500">{month}</p>
        </div>
        <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300">
          {'This month'}
        </span>
      </div>
      {valid && cashFlow.completed_transaction_count > 0 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.06] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
                <AppIcon
                  name="arrow-down-left"
                  className="h-3.5 w-3.5 text-emerald-400"
                />
                {'Money in'}
              </div>
              <p className="text-base font-semibold tabular-nums text-emerald-400">
                +{formatMoney(moneyIn, currency, language)}
              </p>
            </div>
            <div className="rounded-xl border border-rose-500/10 bg-rose-500/[0.06] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
                <AppIcon
                  name="arrow-up-right"
                  className="h-3.5 w-3.5 text-rose-400"
                />
                {'Money out'}
              </div>
              <p className="text-base font-semibold tabular-nums text-rose-400">
                −{formatMoney(moneyOut, currency, language)}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">{'Net cash flow'}</span>
              <span
                className={`text-lg font-semibold tabular-nums ${net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
              >
                {net > 0 ? '+' : net < 0 ? '−' : ''}
                {formatMoney(Math.abs(net), currency, language)}
              </span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-emerald-400"
                style={{
                  width: `${moneyIn + moneyOut > 0 ? (moneyIn / (moneyIn + moneyOut)) * 100 : 0}%`,
                }}
              />
              <div
                className="h-full bg-rose-400"
                style={{
                  width: `${moneyIn + moneyOut > 0 ? (moneyOut / (moneyIn + moneyOut)) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-slate-500">
              <span>{'Money in'}</span>
              <span>{'Money out'}</span>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-800 pt-3">
            <span className="text-xs text-slate-500">
              {'Completed transactions'}
            </span>
            <span className="text-sm font-semibold tabular-nums text-slate-200">
              {cashFlow.completed_transaction_count}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 px-4 py-7 text-center">
          <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-400">
            <AppIcon name="activity" className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium text-slate-300">
            {'No activity this month'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {'Completed transactions will appear here.'}
          </p>
        </div>
      )}
    </section>
  );
}

function QuickAction({
  to,
  title,
  description,
  icon,
}: {
  to: string;
  title: string;
  description: string;
  icon: AppIconName;
}) {
  return (
    <Link
      to={to}
      aria-label={`${title}: ${description}`}
      className="group relative flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-slate-700/80 bg-gradient-to-b from-slate-800/80 to-slate-950/80 px-2 py-4 text-center shadow-sm shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-blue-300/40 hover:from-blue-950/60 hover:to-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/25 shadow-inner shadow-blue-200/[0.04] transition duration-200 group-hover:scale-105 group-hover:bg-blue-500/25 group-hover:text-blue-100">
        <AppIcon name={icon} className="h-5 w-5" />
      </span>
      <span className="block max-w-full truncate text-xs font-semibold text-slate-100 sm:text-sm">
        {title}
      </span>
    </Link>
  );
}

function DashboardContent({ overview }: { overview: DashboardOverview }) {
  const language = 'en';

  return (
    <div className="min-w-0 space-y-6 pb-8 sm:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-4xl">
            {'Financial overview'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            {"Here's an overview of your account."}
          </p>
        </div>
        <p className="rounded-full border border-slate-700/80 bg-slate-900/70 px-3.5 py-2 text-xs font-medium tracking-wide text-slate-300 shadow-sm shadow-black/10">
          {formatCurrentDate(language)}
        </p>
      </div>

      <section className="relative isolate overflow-hidden rounded-2xl border border-blue-300/25 bg-[radial-gradient(ellipse_at_78%_15%,rgba(37,99,235,0.30),transparent_42%),linear-gradient(115deg,#0d2345_0%,#09172e_50%,#0e1b38_100%)] p-5 shadow-xl shadow-blue-950/25 sm:p-7">
        <div
          className="pointer-events-none absolute -right-10 -top-24 -z-10 h-64 w-64 rounded-full border border-blue-300/10"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-2 -top-16 -z-10 h-52 w-52 rounded-full border border-blue-300/10"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-20 right-[12%] -z-10 h-36 w-[48%] rotate-[-12deg] rounded-[50%] border-t border-blue-400/30 shadow-[0_-12px_35px_-18px_rgba(59,130,246,0.75)]"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-blue-100/75">
              {'Total balance'}
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {formatMoney(overview.total_balance, overview.currency, language)}
            </p>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-blue-100/55">
              {overview.currency} ·{' '}
              {`Across ${overview.account_count} account${overview.account_count === 1 ? '' : 's'}`}
            </p>
          </div>
          <Link
            to="/accounts"
            className="inline-flex min-h-10 items-center rounded-xl border border-blue-200/20 bg-white/5 px-4 py-2 text-sm font-medium text-blue-50 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-200/50"
          >
            {'View accounts'}
            <AppIcon name="arrow-up-right" className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>

      <section
        aria-label={'Dashboard statistics'}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <MetricCard
          label={'Accounts'}
          value={overview.account_count}
          detail={'Your Idemerax accounts'}
          icon="accounts"
          iconClass="bg-blue-500/15 text-blue-300"
        />
        <MetricCard
          label={'Active cards'}
          value={overview.active_card_count}
          detail={'Virtual demo debit cards'}
          icon="cards"
          iconClass="bg-violet-500/15 text-violet-300"
        />
        <MetricCard
          label={'Activity this week'}
          value={overview.recent_activity_count}
          detail={'Transactions in the last 7 days'}
          icon="activity"
          iconClass="bg-emerald-500/15 text-emerald-300"
        />
      </section>

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/90 via-slate-900/75 to-slate-950/80 p-5 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.9)] before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent sm:p-6">
            <SectionTitle
              title={'Account overview'}
              action={
                <Link
                  to="/accounts"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-300 transition hover:text-blue-200"
                >
                  {'Manage accounts'}
                  <AppIcon name="arrow-up-right" className="h-3.5 w-3.5" />
                </Link>
              }
            />
            {overview.accounts.length ? (
              <div className="space-y-2.5">
                {overview.accounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    currency={overview.currency}
                    language={language}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 px-4 py-7 text-center">
                <p className="text-sm font-medium text-slate-200">
                  {'No accounts yet'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {'Open an account to get started.'}
                </p>
                <Link
                  to="/accounts"
                  className="mt-4 inline-flex text-sm font-semibold text-blue-300 hover:text-blue-200"
                >
                  {'Open accounts'} →
                </Link>
              </div>
            )}
          </section>
          <section className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/90 via-slate-900/75 to-slate-950/80 p-5 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.9)] before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent sm:p-6">
            <SectionTitle
              title={'Recent transactions'}
              action={
                <Link
                  to="/transactions?tab=history"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-300 transition hover:text-blue-200"
                >
                  {'View all'}
                  <AppIcon name="arrow-up-right" className="h-3.5 w-3.5" />
                </Link>
              }
            />
            {overview.recent_transactions.length ? (
              <ul className="flex flex-col gap-2">
                {overview.recent_transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    currency={overview.currency}
                    language={language}
                  />
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 px-4 py-8 text-center">
                <AppIcon
                  name="transactions"
                  className="mx-auto h-7 w-7 text-slate-500"
                />
                <p className="mt-3 text-sm font-medium text-slate-200">
                  {'No transactions yet'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {'Your recent transactions will appear here.'}
                </p>
              </div>
            )}
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <section className="relative min-w-0 overflow-hidden rounded-2xl border border-blue-400/25 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-blue-950/20 p-5 shadow-[0_18px_44px_-30px_rgba(37,99,235,0.3)] before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-blue-300/30 before:to-transparent sm:p-6">
            <SectionTitle title={'Quick actions'} />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <QuickAction
                to="/transactions"
                title={'Send money'}
                description={'Start a transfer'}
                icon="arrow-up-right"
              />
              <QuickAction
                to="/transactions?tab=history"
                title={'View transactions'}
                description={'Transaction history'}
                icon="transactions"
              />
              <QuickAction
                to="/accounts"
                title={'Manage accounts'}
                description={'Account details'}
                icon="accounts"
              />
              <QuickAction
                to="/cards"
                title={'Manage cards'}
                description={'Card details'}
                icon="cards"
              />
            </div>
          </section>
          <CashFlowCard
            cashFlow={overview.monthly_cash_flow}
            currency={overview.currency}
            language={language}
          />
          <section className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/90 via-slate-900/75 to-slate-950/80 p-5 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.9)] before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent sm:p-6">
            <SectionTitle title={'Notifications'} />
            <div
              className="rounded-xl border border-slate-800 bg-slate-950/35 p-4"
              role="status"
            >
              <p className="text-sm font-medium text-slate-200">
                {'Notifications are temporarily unavailable'}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {
                  'The notification center is not enabled yet. Transaction status and recovery information remain available above.'
                }
              </p>
              <Link
                to="/settings?tab=notifications"
                className="mt-3 inline-flex text-xs font-semibold text-blue-300 transition hover:text-blue-200"
              >
                {'Notification preferences'} →
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function DashboardPage() {
  const { accessToken } = useAuth();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const loadOverview = useCallback(async () => {
    const generation = ++requestGeneration.current;
    if (!accessToken) {
      setError('You are not authenticated.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getDashboardOverview(accessToken);
      if (generation === requestGeneration.current) {
        setOverview(result);
      }
    } catch (requestError) {
      if (generation === requestGeneration.current) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load the dashboard. Please try again.',
        );
      }
    } finally {
      if (generation === requestGeneration.current) {
        setIsLoading(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    let isActive = true;

    // Defer the initial request until after the effect has completed so
    // React does not observe synchronous state updates during effect setup.
    void Promise.resolve().then(() => {
      if (isActive) {
        void loadOverview();
      }
    });

    return () => {
      isActive = false;
      requestGeneration.current += 1;
    };
  }, [loadOverview]);

  if (isLoading) {
    return (
      <section
        className="min-w-0 space-y-6"
        aria-busy="true"
        aria-label={'Loading dashboard'}
      >
        <div className="h-16 animate-pulse rounded-2xl bg-slate-900" />
        <div className="h-40 animate-pulse rounded-3xl bg-slate-900" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="h-28 animate-pulse rounded-2xl bg-slate-900" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-900" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-900" />
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl bg-slate-900" />
          <div className="h-72 animate-pulse rounded-2xl bg-slate-900" />
        </div>
      </section>
    );
  }

  if (error || !overview) {
    return (
      <section
        className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6"
        role="alert"
      >
        <h1 className="text-xl font-semibold text-white">{'Dashboard'}</h1>
        <p className="mt-2 text-sm text-red-200">
          {error ?? 'Unable to load the dashboard. Please try again.'}
        </p>
        <button
          type="button"
          onClick={() => void loadOverview()}
          className="mt-4 min-h-10 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          {'Retry'}
        </button>
      </section>
    );
  }

  return <DashboardContent overview={overview} />;
}

export default DashboardPage;
