import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getTransactionHistory,
  type TransactionHistoryItem,
} from '../api/transactions';

const PAGE_SIZE = 10;
const HISTORY_FETCH_LIMIT = 100;

type Direction = 'incoming' | 'outgoing';

interface TransactionHistoryProps {
  accessToken: string | null;
}

interface TransactionGroup {
  key: string;
  label: string;
  items: TransactionHistoryItem[];
}

function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) {
    return '—';
  }

  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

function formatAmount(amount: string, direction: Direction): string {
  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return '—';
  }

  return `${direction === 'incoming' ? '+' : '−'}${formatCurrency(
    Math.abs(value),
  )}`;
}

function formatDate(createdAt: string, includeTime = false): string {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
  }).format(date);
}

function getDateKey(createdAt: string): string {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return 'unknown-date';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDateLabel(dateKey: string): string {
  if (dateKey === 'unknown-date') {
    return 'Date unavailable';
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();

  if (dateKey === getLocalDateKey(today)) {
    return 'Today';
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateKey === getLocalDateKey(yesterday)) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function getStatusClasses(status: string): string {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';

    case 'FAILED':
    case 'REJECTED':
      return 'border-red-500/20 bg-red-500/10 text-red-400';

    case 'PENDING':
    case 'PROCESSING':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-400';

    default:
      return 'border-slate-700 bg-slate-800/70 text-slate-300';
  }
}

function getCounterparty(item: TransactionHistoryItem): string {
  const name = item.counterparty_name?.trim();

  if (name) {
    return name;
  }

  const email = item.counterparty_email?.trim();

  if (email) {
    return email;
  }

  const iban = item.counterparty_iban?.trim();

  if (iban) {
    return formatIban(iban);
  }

  return 'Idemerax account';
}

function formatIban(iban: string): string {
  return iban
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/**
 * Fetch all available history pages so account-specific numbering
 * does not restart on the currently displayed page.
 */
async function getAllTransactionHistory(
  accessToken: string,
): Promise<TransactionHistoryItem[]> {
  const allItems: TransactionHistoryItem[] = [];
  const seenIds = new Set<number>();

  let offset = 0;
  let total: number;

  do {
    const result = await getTransactionHistory(
      accessToken,
      HISTORY_FETCH_LIMIT,
      offset,
    );

    total = result.total;

    if (result.items.length === 0) {
      break;
    }

    let newItemsCount = 0;

    for (const item of result.items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allItems.push(item);
        newItemsCount += 1;
      }
    }

    // Avoid repeatedly requesting the same page if the API response
    // does not advance as expected.
    if (newItemsCount === 0) {
      break;
    }

    offset += result.items.length;
  } while (offset < total);

  return allItems;
}

/**
 * Assign one-based transaction numbers independently for each account.
 *
 * Incoming transfers are numbered against the destination account.
 * Outgoing transfers are numbered against the source account.
 *
 * Each account starts at #1. Older transactions receive lower numbers.
 */
function createTransactionNumbers(
  allItems: TransactionHistoryItem[],
): Record<number, number> {
  const accountCounters = new Map<number, number>();
  const transactionNumbers: Record<number, number> = {};

  const chronologicalItems = [...allItems].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    const validA = Number.isFinite(timeA);
    const validB = Number.isFinite(timeB);

    if (validA && validB && timeA !== timeB) {
      return timeA - timeB;
    }

    if (validA !== validB) {
      return validA ? -1 : 1;
    }

    return a.id - b.id;
  });

  for (const item of chronologicalItems) {
    const accountId =
      item.direction === 'outgoing'
        ? item.source_account_id
        : item.destination_account_id;

    const nextNumber = accountCounters.get(accountId) ?? 1;

    transactionNumbers[item.id] = nextNumber;
    accountCounters.set(accountId, nextNumber + 1);
  }

  return transactionNumbers;
}

function sumAmounts(items: TransactionHistoryItem[]): number {
  return items.reduce((sum, item) => {
    const amount = Number(item.amount);

    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Opens a print-ready transaction receipt. The user can choose
 * "Save as PDF" in the browser's print dialog. This is deliberately
 * labelled as a demo receipt, not an official bank/payment confirmation.
 */
function exportTransactionReceipt(
  item: TransactionHistoryItem,
  transactionNumber: number | undefined,
): void {
  const receiptWindow = window.open('', '_blank');

  if (!receiptWindow) {
    window.alert('Please allow pop-ups to export the transaction receipt.');
    return;
  }

  const isIncoming = item.direction === 'incoming';
  const status = item.status.replaceAll('_', ' ');
  const method =
    item.transfer_method === 'iban'
      ? 'IBAN transfer'
      : item.transfer_method === 'email'
        ? 'Email transfer'
        : 'Transfer method unavailable';
  const counterparty = getCounterparty(item);
  const reference = item.reference?.trim() || 'Not provided';
  const contactDetail =
    item.transfer_method === 'iban'
      ? item.counterparty_iban
        ? formatIban(item.counterparty_iban)
        : ''
      : item.transfer_method === 'email'
        ? item.counterparty_email || ''
        : '';

  const details: Array<[string, string]> = [
    ['Transaction number', `#${transactionNumber ?? '—'}`],
    [isIncoming ? 'Sender' : 'Recipient', counterparty],
    ...(contactDetail
      ? [
          [
            item.transfer_method === 'iban' ? 'IBAN' : 'Email',
            contactDetail,
          ] as [string, string],
        ]
      : []),
    ['Direction', isIncoming ? 'Incoming' : 'Outgoing'],
    ['Transfer method', method],
    ['Date and time', formatDate(item.created_at, true)],
    ['Reference', reference],
    ['Status', status],
  ];

  const rows = details
    .map(
      ([label, value]) => `
        <div class="detail-row">
          <span class="label">${escapeHtml(label)}</span>
          <span class="value">${escapeHtml(value)}</span>
        </div>`,
    )
    .join('');

  receiptWindow.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Idemerax — Transaction Receipt #${escapeHtml(String(transactionNumber ?? '—'))}</title>
  <script>
    function printReceipt() {
      const originalTitle = document.title;
      const transactionNumber = ${JSON.stringify(String(transactionNumber ?? '—'))};
      document.title = 'Idemerax-Transaction-Receipt-' + transactionNumber;
      window.print();
      document.title = originalTitle;
    }
  </script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 36px 20px; color: #172033; background: #f3f5f9; font: 14px/1.5 Arial, Helvetica, sans-serif; }
    .receipt { max-width: 720px; margin: 0 auto; padding: 40px; background: #fff; border: 1px solid #e1e6ef; border-radius: 16px; }
    .brand { color: #2563eb; font-size: 13px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 10px 0 4px; font-size: 28px; letter-spacing: -.03em; }
    .subtitle { margin: 0; color: #64748b; }
    .amount-box { margin: 28px 0 24px; padding: 22px; border: 1px solid #dbeafe; border-radius: 12px; background: #f8fbff; }
    .amount-label { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    .amount { margin-top: 6px; font-size: 30px; font-weight: 700; letter-spacing: -.03em; }
    .status { margin-top: 8px; color: #475569; font-size: 12px; }
    .details { border-top: 1px solid #e2e8f0; }
    .detail-row { display: flex; justify-content: space-between; gap: 24px; padding: 13px 0; border-bottom: 1px solid #e2e8f0; }
    .label { flex: 0 0 38%; color: #64748b; }
    .value { min-width: 0; overflow-wrap: anywhere; text-align: right; font-weight: 600; }
    .warning { margin-top: 26px; padding: 15px 16px; border: 1px solid #f4d28a; border-radius: 10px; background: #fffbeb; color: #854d0e; }
    .warning strong { display: block; margin-bottom: 4px; }
    .footer { margin-top: 22px; color: #94a3b8; font-size: 11px; }
    .print-actions { display: flex; justify-content: flex-end; gap: 10px; max-width: 720px; margin: 0 auto 16px; }
    .print-actions button { padding: 10px 16px; border: 0; border-radius: 8px; color: white; background: #2563eb; font-weight: 600; cursor: pointer; }
    .print-actions .secondary { color: #334155; background: #e2e8f0; }
    @media (max-width: 520px) { body { padding: 16px 10px; } .receipt { padding: 22px 18px; } h1 { font-size: 24px; } .detail-row { gap: 12px; } .label { flex-basis: 36%; } }
    @media print { body { padding: 0; background: #fff; } .receipt { max-width: none; padding: 0; border: 0; border-radius: 0; } .print-actions { display: none; } @page { size: A4; margin: 18mm; } }
  </style>
</head>
<body>
  <div class="print-actions">
    <button class="secondary" onclick="window.close()" type="button">Close</button>
    <button onclick="printReceipt()" type="button">Print / Save as PDF</button>
  </div>
  <main class="receipt">
    <div class="brand">Idemerax</div>
    <h1>Transaction receipt</h1>
    <p class="subtitle">Transaction details for your personal records</p>
    <section class="amount-box">
      <div class="amount-label">${isIncoming ? 'Amount received' : 'Amount sent'}</div>
      <div class="amount">${escapeHtml(formatAmount(item.amount, item.direction))}</div>
      <div class="status">Status: ${escapeHtml(status)}</div>
    </section>
    <section class="details">${rows}</section>
    <aside class="warning">
      <strong>Demo receipt — not an official bank document</strong>
      Idemerax is not a bank or payment institution. This receipt reflects transaction information recorded inside Idemerax. No real money was transferred. It is not proof of payment, a bank statement, or an official financial confirmation.
    </aside>
    <p class="footer">Generated by Idemerax. Transaction number: #${escapeHtml(String(transactionNumber ?? '—'))}</p>
  </main>
</body>
</html>`);

  receiptWindow.document.close();
  receiptWindow.focus();
}

function TransactionHistory({ accessToken }: TransactionHistoryProps) {
  const [items, setItems] = useState<TransactionHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const [transactionNumbers, setTransactionNumbers] = useState<
    Record<number, number>
  >({});

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionHistoryItem | null>(null);

  const latestRequestId = useRef(0);

  const loadHistory = useCallback(async () => {
    const requestId = ++latestRequestId.current;

    try {
      const request = accessToken
        ? Promise.all([
            getTransactionHistory(accessToken, PAGE_SIZE, offset),
            getAllTransactionHistory(accessToken),
          ])
        : Promise.reject(
            new Error('You must be authenticated to view transaction history.'),
          );

      const [pageResult, allHistoryItems] = await request;

      if (requestId !== latestRequestId.current) {
        return;
      }

      if (offset > 0 && offset >= pageResult.total) {
        const lastPageOffset = Math.max(
          0,
          Math.floor((pageResult.total - 1) / PAGE_SIZE) * PAGE_SIZE,
        );

        setOffset(lastPageOffset);
        return;
      }

      setItems(pageResult.items);
      setTotal(pageResult.total);
      setTransactionNumbers(createTransactionNumbers(allHistoryItems));

      setSelectedTransaction((current) => {
        if (current === null) {
          return null;
        }

        return pageResult.items.find((item) => item.id === current.id) ?? null;
      });

      setError(null);
    } catch (loadError) {
      if (requestId !== latestRequestId.current) {
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load transaction history.',
      );
    } finally {
      if (requestId === latestRequestId.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [accessToken, offset]);

  useEffect(() => {
    let isActive = true;

    // Start the initial request after the effect has completed so its state
    // updates are not performed synchronously inside the effect.
    void Promise.resolve().then(() => {
      if (isActive) {
        void loadHistory();
      }
    });

    return () => {
      isActive = false;
      latestRequestId.current += 1;
    };
  }, [loadHistory]);

  useEffect(() => {
    if (!selectedTransaction) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedTransaction(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedTransaction]);

  const groups: TransactionGroup[] = (() => {
    const groupsByDate = new Map<string, TransactionGroup>();

    for (const item of items) {
      const key = getDateKey(item.created_at);
      let group = groupsByDate.get(key);

      if (!group) {
        group = {
          key,
          label: getDateLabel(key),
          items: [],
        };

        groupsByDate.set(key, group);
      }

      group.items.push(item);
    }

    return Array.from(groupsByDate.values());
  })();

  const incomingItems = items.filter((item) => item.direction === 'incoming');

  const outgoingItems = items.filter((item) => item.direction === 'outgoing');

  const incomingTotal = sumAmounts(incomingItems);
  const outgoingTotal = sumAmounts(outgoingItems);

  const hasPreviousPage = offset > 0;
  const hasNextPage = offset + items.length < total;

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Transaction History
          </h2>

          <p className="mt-1 text-sm leading-6 text-slate-400">
            Review your incoming and outgoing transactions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsRefreshing(true);
            setError(null);
            void loadHistory();
          }}
          disabled={isLoading || isRefreshing}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path
              d="M20 7v5h-5M4 17v-5h5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {isLoading ? (
        <div
          role="status"
          aria-label="Loading transaction history"
          className="rounded-2xl border border-slate-800 bg-slate-950/60 px-6 py-14 text-center"
        >
          <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />

          <p className="mt-4 text-sm text-slate-400">
            Loading transaction history…
          </p>
        </div>
      ) : error && items.length === 0 ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-5 sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <svg
              viewBox="0 0 24 24"
              className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
            </svg>

            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-red-300">
                Unable to load transactions
              </h3>

              <p
                role="alert"
                className="mt-1 break-words text-sm text-red-300/80"
              >
                {error}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setError(null);
              void loadHistory();
            }}
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20"
          >
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-400">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path
                d="M7 3h10a2 2 0 0 1 2 2v14l-4-2-3 2-3-2-4 2V5a2 2 0 0 1 2-2Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M8 8h8M8 12h8" strokeLinecap="round" />
            </svg>
          </div>

          <h3 className="mt-4 font-medium text-white">No transactions yet</h3>

          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-400">
            Your incoming and outgoing transactions will appear here once you
            make or receive a transfer.
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300"
            >
              Refresh failed: {error}
            </div>
          )}

          {/* Transaction statistics */}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 sm:p-5">
              <p className="text-sm text-slate-400">
                Transactions on this page
              </p>

              <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
                {items.length}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Of {total} total transactions
              </p>
            </div>

            <div className="min-w-0 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-4 sm:p-5">
              <p className="text-sm text-slate-400">Incoming · this page</p>

              <p className="mt-2 break-words text-2xl font-semibold tabular-nums text-emerald-400">
                {formatCurrency(incomingTotal)}
              </p>

              <p className="mt-1 text-xs text-slate-500">Received transfers</p>
            </div>

            <div className="min-w-0 rounded-2xl border border-blue-500/15 bg-blue-500/[0.04] p-4 sm:p-5">
              <p className="text-sm text-slate-400">Outgoing · this page</p>

              <p className="mt-2 break-words text-2xl font-semibold tabular-nums text-blue-400">
                {formatCurrency(outgoingTotal)}
              </p>

              <p className="mt-1 text-xs text-slate-500">Sent transfers</p>
            </div>
          </div>

          {/* Transaction history */}
          <div className="min-w-0 space-y-7">
            {groups.map((group) => (
              <section key={group.key} className="min-w-0">
                <div className="mb-3 flex min-w-0 items-center gap-3">
                  <h3 className="shrink-0 text-sm font-semibold text-slate-300">
                    {group.label}
                  </h3>

                  <div className="h-px min-w-0 flex-1 bg-slate-800" />

                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                    {group.items.length}{' '}
                    {group.items.length === 1 ? 'transaction' : 'transactions'}
                  </span>
                </div>

                <div className="min-w-0 space-y-2">
                  {group.items.map((item) => {
                    const incoming = item.direction === 'incoming';
                    const counterparty = getCounterparty(item);
                    const transactionNumber = transactionNumbers[item.id];

                    return (
                      <article
                        key={item.id}
                        className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 transition duration-200 hover:border-slate-700"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedTransaction(item)}
                          aria-label={`View transaction details: ${counterparty}, ${formatAmount(item.amount, item.direction)}`}
                          className="flex min-h-11 w-full min-w-0 max-w-full flex-col gap-4 overflow-hidden p-4 text-left transition hover:bg-slate-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:p-5 md:flex-row md:items-center"
                        >
                          <div className="flex min-w-0 max-w-full flex-1 items-start gap-3 sm:gap-4">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                                incoming
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-blue-500/10 text-blue-400'
                              }`}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden="true"
                              >
                                {incoming ? (
                                  <path
                                    d="M7 10l5 5 5-5M12 15V3M5 21h14"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                ) : (
                                  <path
                                    d="M7 14l5-5 5 5M12 9v12M5 3h14"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                )}
                              </svg>
                            </div>

                            <div className="min-w-0 max-w-full flex-1">
                              <p className="break-words text-sm font-semibold leading-6 text-white sm:text-base">
                                {counterparty}
                              </p>

                              <p className="mt-1 text-sm leading-5 text-slate-400">
                                {incoming
                                  ? 'Incoming transfer'
                                  : 'Outgoing transfer'}
                              </p>

                              <p className="mt-1 text-xs font-medium tabular-nums text-slate-500">
                                Transaction #{transactionNumber ?? '—'}
                              </p>

                              <div className="mt-2 flex min-w-0 max-w-full flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                                    item.transfer_method === 'iban'
                                      ? 'border-blue-500/25 bg-blue-500/10 text-blue-300'
                                      : item.transfer_method === 'email'
                                        ? 'border-violet-500/25 bg-violet-500/10 text-violet-300'
                                        : 'border-slate-700 bg-slate-900 text-slate-300'
                                  }`}
                                >
                                  {item.transfer_method === 'iban' ? (
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-3.5 w-3.5 shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      aria-hidden="true"
                                    >
                                      <rect
                                        x="3"
                                        y="5"
                                        width="18"
                                        height="14"
                                        rx="2"
                                      />
                                      <path
                                        d="M3 10h18M7 15h3"
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                  ) : item.transfer_method === 'email' ? (
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-3.5 w-3.5 shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      aria-hidden="true"
                                    >
                                      <rect
                                        x="3"
                                        y="5"
                                        width="18"
                                        height="14"
                                        rx="2"
                                      />
                                      <path
                                        d="m4 7 8 6 8-6"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  ) : null}
                                  {item.transfer_method === 'iban'
                                    ? 'IBAN transfer'
                                    : item.transfer_method === 'email'
                                      ? 'Email transfer'
                                      : 'Transfer method unavailable'}
                                </span>

                                <span
                                  className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClasses(item.status)}`}
                                >
                                  {item.status.replaceAll('_', ' ')}
                                </span>
                              </div>

                              {item.reference?.trim() && (
                                <div className="mt-2 flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1 text-xs leading-5">
                                  <span className="shrink-0 text-slate-500">
                                    Reference:
                                  </span>
                                  <span className="min-w-0 whitespace-normal break-all text-slate-400">
                                    {item.reference.trim()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex w-full min-w-0 max-w-full items-center justify-between gap-3 border-t border-slate-800/80 pt-3 md:w-auto md:shrink-0 md:flex-col md:items-end md:justify-center md:border-t-0 md:pt-0">
                            <p
                              className={`shrink-0 text-base font-semibold tabular-nums sm:text-lg ${
                                incoming ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {formatAmount(item.amount, item.direction)}
                            </p>

                            <div className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-400 transition group-hover:text-slate-200">
                              <span className="hidden sm:inline">
                                View details
                              </span>

                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden="true"
                              >
                                <path
                                  d="M7 17 17 7M8 7h9v9"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>
                          </div>
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* Pagination */}
          <footer className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-sm tabular-nums text-slate-400">
              Showing {offset + 1}–{Math.min(offset + items.length, total)} of{' '}
              {total}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsRefreshing(true);
                  setError(null);
                  setOffset((current) => Math.max(0, current - PAGE_SIZE));
                }}
                disabled={!hasPreviousPage || isLoading || isRefreshing}
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
              >
                Previous
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsRefreshing(true);
                  setError(null);
                  setOffset((current) => current + PAGE_SIZE);
                }}
                disabled={!hasNextPage || isLoading || isRefreshing}
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
              >
                Next
              </button>
            </div>
          </footer>
        </>
      )}

      {/* Transaction details modal */}
      {selectedTransaction && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedTransaction(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-details-title"
            className="max-h-[92dvh] w-full min-w-0 max-w-xl overflow-x-hidden overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl sm:rounded-2xl sm:p-7"
          >
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <h2
                  id="transaction-details-title"
                  className="text-xl font-semibold text-white"
                >
                  Transaction Details
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Full details for this transaction.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                aria-label="Close transaction details"
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="my-6 min-w-0 text-center">
              <p
                className={`break-words text-3xl font-semibold tabular-nums ${
                  selectedTransaction.direction === 'incoming'
                    ? 'text-emerald-400'
                    : 'text-red-400'
                }`}
              >
                {formatAmount(
                  selectedTransaction.amount,
                  selectedTransaction.direction,
                )}
              </p>

              <span
                className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusClasses(selectedTransaction.status)}`}
              >
                {selectedTransaction.status.replaceAll('_', ' ')}
              </span>

              {/* Improved booking confirmation, only inside View details */}
              <div
                className={`mx-auto mt-4 flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                  selectedTransaction.status.toUpperCase() === 'COMPLETED'
                    ? 'border-emerald-500/25 bg-emerald-500/[0.07]'
                    : 'border-slate-700 bg-slate-900/70'
                }`}
                role="status"
              >
                {selectedTransaction.status.toUpperCase() === 'COMPLETED' ? (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      aria-hidden="true"
                    >
                      <path
                        d="m5 12 4 4L19 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-slate-400">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
                    </svg>
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold leading-5 ${
                      selectedTransaction.status.toUpperCase() === 'COMPLETED'
                        ? 'text-emerald-300'
                        : 'text-slate-300'
                    }`}
                  >
                    {selectedTransaction.status.toUpperCase() === 'COMPLETED'
                      ? 'Internally booked'
                      : `Booking ${selectedTransaction.status
                          .replaceAll('_', ' ')
                          .toLocaleLowerCase('en-US')}`}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    {selectedTransaction.status.toUpperCase() === 'COMPLETED'
                      ? 'This transfer has been recorded in Idemerax.'
                      : 'The transaction is not marked as completed yet.'}
                  </p>
                </div>
              </div>

              <div className="mx-auto mt-3 flex max-w-sm flex-wrap items-center justify-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    selectedTransaction.transfer_method === 'iban'
                      ? 'border-blue-500/25 bg-blue-500/10 text-blue-300'
                      : selectedTransaction.transfer_method === 'email'
                        ? 'border-violet-500/25 bg-violet-500/10 text-violet-300'
                        : 'border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  {selectedTransaction.transfer_method === 'iban' ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="M3 10h18M7 15h3" strokeLinecap="round" />
                    </svg>
                  ) : selectedTransaction.transfer_method === 'email' ? (
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
                  {selectedTransaction.transfer_method === 'iban'
                    ? 'IBAN transfer'
                    : selectedTransaction.transfer_method === 'email'
                      ? 'Email transfer'
                      : 'Transfer method unavailable'}
                </span>

                <span className="text-xs text-slate-400">
                  {selectedTransaction.transfer_method === 'iban'
                    ? 'Recipient identified by IBAN'
                    : selectedTransaction.transfer_method === 'email'
                      ? 'Recipient identified by email address'
                      : 'Transfer method not recorded'}
                </span>
              </div>
            </div>

            <dl className="min-w-0 divide-y divide-slate-800 border-y border-slate-800">
              <div className="flex min-w-0 justify-between gap-5 py-3">
                <dt className="shrink-0 text-sm text-slate-400">
                  Transaction number
                </dt>

                <dd className="text-right font-mono text-sm font-medium text-slate-200">
                  #{transactionNumbers[selectedTransaction.id] ?? '—'}
                </dd>
              </div>

              <div className="flex min-w-0 justify-between gap-5 py-3">
                <dt className="shrink-0 text-sm text-slate-400">
                  {selectedTransaction.direction === 'incoming'
                    ? 'Sender'
                    : 'Recipient'}
                </dt>

                <dd className="min-w-0 break-all text-right text-sm font-medium text-white">
                  {getCounterparty(selectedTransaction)}
                </dd>
              </div>

              {selectedTransaction.transfer_method === 'email' &&
                selectedTransaction.counterparty_email && (
                  <div className="flex min-w-0 justify-between gap-5 py-3">
                    <dt className="shrink-0 text-sm text-slate-400">
                      {selectedTransaction.direction === 'incoming'
                        ? 'Sender email'
                        : 'Recipient email'}
                    </dt>

                    <dd className="min-w-0 break-all text-right text-sm text-slate-200">
                      {selectedTransaction.counterparty_email}
                    </dd>
                  </div>
                )}

              {selectedTransaction.transfer_method === 'iban' &&
                selectedTransaction.counterparty_iban && (
                  <div className="flex min-w-0 justify-between gap-5 py-3">
                    <dt className="shrink-0 text-sm text-slate-400">IBAN</dt>

                    <dd className="min-w-0 break-all text-right font-mono text-sm text-slate-200">
                      {formatIban(selectedTransaction.counterparty_iban)}
                    </dd>
                  </div>
                )}

              <div className="flex min-w-0 justify-between gap-5 py-3">
                <dt className="shrink-0 text-sm text-slate-400">Direction</dt>

                <dd className="text-right text-sm text-slate-200">
                  {selectedTransaction.direction === 'incoming'
                    ? 'Incoming'
                    : 'Outgoing'}
                </dd>
              </div>

              <div className="flex min-w-0 justify-between gap-5 py-3">
                <dt className="shrink-0 text-sm text-slate-400">
                  Transfer method
                </dt>

                <dd className="min-w-0 text-right text-sm text-slate-200">
                  {selectedTransaction.transfer_method === 'iban'
                    ? 'IBAN transfer'
                    : selectedTransaction.transfer_method === 'email'
                      ? 'Email transfer'
                      : 'Transfer method unavailable'}
                </dd>
              </div>

              <div className="flex min-w-0 justify-between gap-5 py-3">
                <dt className="shrink-0 text-sm text-slate-400">
                  Date and time
                </dt>

                <dd className="text-right text-sm text-slate-200">
                  {formatDate(selectedTransaction.created_at, true)}
                </dd>
              </div>

              {/* Long references wrap instead of widening the modal. */}
              <div className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:justify-between sm:gap-5">
                <dt className="shrink-0 text-sm text-slate-400">Reference</dt>

                <dd className="min-w-0 max-w-full whitespace-normal break-all text-left text-sm leading-6 text-slate-200 sm:flex-1 sm:text-right">
                  {selectedTransaction.reference?.trim() || 'Not provided'}
                </dd>
              </div>

              <div className="flex min-w-0 justify-between gap-5 py-3">
                <dt className="shrink-0 text-sm text-slate-400">Status</dt>

                <dd className="text-right text-sm text-slate-200">
                  {selectedTransaction.status.replaceAll('_', ' ')}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() =>
                  exportTransactionReceipt(
                    selectedTransaction,
                    transactionNumbers[selectedTransaction.id],
                  )
                }
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path
                    d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Print / Save as PDF
              </button>

              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                className="min-h-11 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                Done
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-amber-300/90">
              Demo only: this receipt is not an official bank document or proof
              of payment. Idemerax does not transfer real money.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}

export default TransactionHistory;
