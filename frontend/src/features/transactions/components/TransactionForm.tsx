import { useEffect, useState } from 'react';

import { getIbanBankDetails, type IbanBankDetails } from '../api/transactions';

type RecipientMethod = 'iban' | 'email';

interface TransactionFormProps {
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (
    recipientMethod: RecipientMethod,
    destination: string,
    amount: string,
    reference: string | null,
  ) => Promise<void>;
  availableBalance: string | null;
  isLoadingBalance: boolean;
  accessToken: string | null;
}

const MAX_TRANSACTION_AMOUNT = 100000;
const MAX_TRANSACTION_REFERENCE_LENGTH = 140;
const MAX_RECIPIENT_EMAIL_LENGTH = 254;

function formatIbanInput(value: string): string {
  return value
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 22)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function getRawIban(value: string): string {
  return value.replace(/\s+/g, '');
}

function getIbanCountryCode(value: string): string {
  return getRawIban(value).slice(0, 2);
}

function isGermanIban(value: string): boolean {
  const countryCode = getIbanCountryCode(value);

  return countryCode.length < 2 || countryCode === 'DE';
}

function isValidIbanLength(value: string): boolean {
  return getRawIban(value).length === 22;
}

function normalizeAmount(value: string): string {
  return value.replace(',', '.');
}

function getNumericAmount(value: string): number {
  const normalized = normalizeAmount(value);

  if (!normalized || normalized === '.') {
    return Number.NaN;
  }

  return Number(normalized);
}

function hasValidAmountFormat(value: string): boolean {
  return /^\d+([.,]\d{1,2})?$/.test(value);
}

function isValidAmount(value: string): boolean {
  if (!value.trim() || !hasValidAmountFormat(value)) {
    return false;
  }

  const numericValue = getNumericAmount(value);

  return (
    Number.isFinite(numericValue) &&
    numericValue > 0 &&
    numericValue <= MAX_TRANSACTION_AMOUNT
  );
}

function hasTooManyDecimalPlaces(value: string): boolean {
  return /[.,]\d{3,}/.test(value);
}

function hasMultipleDecimalSeparators(value: string): boolean {
  return (value.match(/[.,]/g) ?? []).length > 1;
}

function sanitizeAmountInput(value: string): string {
  return value.replace(/[^0-9.,]/g, '');
}

function isValidEmail(value: string): boolean {
  const normalized = value.trim();

  if (!normalized || normalized.length > MAX_RECIPIENT_EMAIL_LENGTH) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function formatBalance(balance: string | null): string {
  if (balance === null) {
    return '—';
  }

  const value = Number(balance);

  if (!Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function TransactionForm({
  isSubmitting,
  error,
  onSubmit,
  availableBalance,
  isLoadingBalance,
  accessToken,
}: TransactionFormProps) {
  const [recipientMethod, setRecipientMethod] =
    useState<RecipientMethod>('iban');

  const [destinationIban, setDestinationIban] = useState('');
  const [destinationEmail, setDestinationEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');

  const [bankDetails, setBankDetails] = useState<IbanBankDetails | null>(null);
  const [isLoadingBankDetails, setIsLoadingBankDetails] = useState(false);
  const [bankDetailsError, setBankDetailsError] = useState<string | null>(null);

  const rawIban = getRawIban(destinationIban);
  const ibanCountryCode = getIbanCountryCode(destinationIban);

  const germanIban = isGermanIban(destinationIban);
  const ibanReachedMaximumLength = rawIban.length === 22;
  const ibanIsValid = germanIban && isValidIbanLength(destinationIban);

  const emailIsValid =
    destinationEmail.trim().length > 0 && isValidEmail(destinationEmail);

  const amountExceedsMaximum =
    hasValidAmountFormat(amount) &&
    getNumericAmount(amount) > MAX_TRANSACTION_AMOUNT;

  const amountHasTooManyDecimals = hasTooManyDecimalPlaces(amount);
  const amountHasMultipleSeparators = hasMultipleDecimalSeparators(amount);
  const amountIsValid = isValidAmount(amount);

  const recipientIsValid =
    recipientMethod === 'iban' ? ibanIsValid : emailIsValid;

  const canSubmit = recipientIsValid && amountIsValid && !isSubmitting;

  const showCountryError =
    recipientMethod === 'iban' && ibanCountryCode.length === 2 && !germanIban;

  useEffect(() => {
    if (!accessToken || !ibanIsValid || recipientMethod !== 'iban') {
      return;
    }

    const token = accessToken;
    const iban = rawIban;
    let isMounted = true;

    async function loadBankDetails(): Promise<void> {
      try {
        setIsLoadingBankDetails(true);

        const details = await getIbanBankDetails(token, iban);

        if (isMounted) {
          setBankDetails(details);
          setBankDetailsError(null);
        }
      } catch (bankDetailsLoadingError) {
        if (isMounted) {
          setBankDetails(null);
          setBankDetailsError(
            bankDetailsLoadingError instanceof Error
              ? bankDetailsLoadingError.message
              : 'Unable to identify the bank.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingBankDetails(false);
        }
      }
    }

    void loadBankDetails();

    return () => {
      isMounted = false;
    };
  }, [accessToken, ibanIsValid, rawIban, recipientMethod]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const destination =
      recipientMethod === 'iban'
        ? getRawIban(destinationIban)
        : destinationEmail.trim().toLowerCase();

    await onSubmit(
      recipientMethod,
      destination,
      normalizeAmount(amount),
      reference.trim() || null,
    );
  }

  function handleRecipientMethodChange(method: RecipientMethod): void {
    if (isSubmitting) {
      return;
    }

    setRecipientMethod(method);
    setBankDetails(null);
    setBankDetailsError(null);
    setIsLoadingBankDetails(false);
  }

  function handleIbanChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const formattedIban = formatIbanInput(event.target.value);

    if (formattedIban === destinationIban) {
      return;
    }

    const formattedIbanIsGerman = isGermanIban(formattedIban);
    const formattedIbanIsValid =
      formattedIbanIsGerman && isValidIbanLength(formattedIban);

    setDestinationIban(formattedIban);
    setBankDetails(null);
    setBankDetailsError(null);
    setIsLoadingBankDetails(Boolean(accessToken && formattedIbanIsValid));
  }

  function handleEmailChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setDestinationEmail(
      event.target.value.slice(0, MAX_RECIPIENT_EMAIL_LENGTH),
    );
  }

  function handleAmountChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ): void {
    setAmount(sanitizeAmountInput(event.target.value));
  }

  function handleReferenceChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ): void {
    setReference(event.target.value.slice(0, MAX_TRANSACTION_REFERENCE_LENGTH));
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/70 shadow-xl shadow-slate-950/30">
      <div className="border-b border-slate-800 px-6 py-6 sm:px-7">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600/15 ring-1 ring-blue-500/20">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-blue-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                d="m21 3-7.5 18-3.75-7.75L2 9.5 21 3Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 3 9.75 13.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">New transfer</h2>

            <p className="mt-1 text-sm text-slate-400">
              Send money securely to another account.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-7 p-6 sm:p-7">
        <div>
          <div className="mb-3">
            <span className="text-sm font-medium text-slate-300">
              Recipient
            </span>
          </div>

          <div
            className="grid grid-cols-2 rounded-xl border border-slate-700 bg-slate-900/80 p-1"
            role="group"
            aria-label="Recipient method"
          >
            <button
              type="button"
              onClick={() => handleRecipientMethodChange('iban')}
              disabled={isSubmitting}
              aria-pressed={recipientMethod === 'iban'}
              className={`h-10 rounded-lg text-sm font-medium transition ${
                recipientMethod === 'iban'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              IBAN
            </button>

            <button
              type="button"
              onClick={() => handleRecipientMethodChange('email')}
              disabled={isSubmitting}
              aria-pressed={recipientMethod === 'email'}
              className={`h-10 rounded-lg text-sm font-medium transition ${
                recipientMethod === 'email'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              Email
            </button>
          </div>
        </div>

        {recipientMethod === 'iban' ? (
          <div>
            <div className="mb-2">
              <label
                htmlFor="destination-iban"
                className="text-sm font-medium text-slate-300"
              >
                Recipient IBAN
              </label>
            </div>

            <div
              className={`flex h-[54px] overflow-hidden rounded-xl border bg-slate-900/80 transition focus-within:ring-2 ${
                showCountryError
                  ? 'border-red-500/50 focus-within:border-red-500/60 focus-within:ring-red-500/10'
                  : destinationIban && ibanIsValid
                    ? 'border-emerald-500/40 focus-within:border-emerald-500/60 focus-within:ring-emerald-500/10'
                    : 'border-slate-700 focus-within:border-blue-500/60 focus-within:ring-blue-500/10'
              }`}
            >
              <input
                id="destination-iban"
                type="text"
                value={destinationIban}
                onChange={handleIbanChange}
                required={recipientMethod === 'iban'}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                placeholder="DE00 0000 0000 0000 0000 00"
                aria-describedby="destination-iban-help"
                className="min-w-0 flex-1 border-0 bg-transparent px-4 text-base font-mono tracking-wide text-white outline-none placeholder:text-slate-600 focus:ring-0"
              />

              <div
                className="flex w-[68px] shrink-0 items-center justify-center border-l border-slate-700"
                aria-hidden="true"
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ring-1 transition ${
                    showCountryError
                      ? 'bg-red-500/15 text-red-400 ring-red-400/30'
                      : destinationIban && ibanIsValid
                        ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-400/30'
                        : 'bg-blue-500/10 text-blue-400 ring-blue-400/20'
                  }`}
                >
                  {showCountryError ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  ) : destinationIban && ibanIsValid ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
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
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M20 21a8 8 0 0 0-16 0" strokeLinecap="round" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </div>
              </div>
            </div>

            {showCountryError ? (
              <p
                id="destination-iban-help"
                className="mt-2 flex items-center gap-1.5 text-xs text-red-400"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                Only German IBANs starting with DE are currently supported.
              </p>
            ) : ibanReachedMaximumLength ? (
              <p
                id="destination-iban-help"
                className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4" strokeLinecap="round" />
                  <path d="M12 16h.01" strokeLinecap="round" />
                </svg>
                IBAN has reached the maximum length of 22 characters.
              </p>
            ) : (
              <p
                id="destination-iban-help"
                className="mt-2 text-xs text-slate-500"
              >
                Enter the IBAN of the account receiving the transfer.
              </p>
            )}

            {ibanIsValid && accessToken && (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
                {isLoadingBankDetails ? (
                  <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <div className="space-y-2">
                      <div className="h-4 w-28 animate-pulse rounded bg-slate-800" />
                      <div className="h-3 w-36 animate-pulse rounded bg-slate-800" />
                    </div>

                    <div className="h-7 w-28 animate-pulse rounded-full bg-slate-800" />
                  </div>
                ) : bankDetails ? (
                  <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600/15 ring-1 ring-blue-500/20">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5 text-blue-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          aria-hidden="true"
                        >
                          <path
                            d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 18h18M4 7l8-4 8 4v2H4V7Z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100">
                          {bankDetails.bank_name}
                        </p>

                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className="font-medium uppercase tracking-wide text-slate-500">
                            BIC
                          </span>

                          <span className="h-3.5 w-px bg-slate-700" />

                          <span className="font-mono tracking-wide text-slate-400">
                            {bankDetails.bic}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/20">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/15">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-2.5 w-2.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          aria-hidden="true"
                        >
                          <path
                            d="m5 12 4 4L19 6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      Bank identified
                    </span>
                  </div>
                ) : bankDetailsError ? (
                  <p className="px-4 py-3.5 text-xs text-red-400">
                    {bankDetailsError}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div>
            <label
              htmlFor="destination-email"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Recipient email
            </label>

            <div
              className={`flex h-[54px] overflow-hidden rounded-xl border bg-slate-900/80 transition focus-within:ring-2 ${
                destinationEmail && emailIsValid
                  ? 'border-emerald-500/40 focus-within:border-emerald-500/60 focus-within:ring-emerald-500/10'
                  : 'border-slate-700 focus-within:border-blue-500/60 focus-within:ring-blue-500/10'
              }`}
            >
              <div className="flex w-[68px] shrink-0 items-center justify-center border-r border-slate-700">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ring-1 ${
                    destinationEmail && emailIsValid
                      ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-400/30'
                      : 'bg-blue-500/10 text-blue-400 ring-blue-400/20'
                  }`}
                  aria-hidden="true"
                >
                  {destinationEmail && emailIsValid ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="m5 12 4 4L19 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path
                        d="m3 7 9 6 9-6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              </div>

              <input
                id="destination-email"
                type="email"
                value={destinationEmail}
                onChange={handleEmailChange}
                required={recipientMethod === 'email'}
                maxLength={MAX_RECIPIENT_EMAIL_LENGTH}
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                placeholder="recipient@example.com"
                aria-describedby="destination-email-help"
                className="min-w-0 flex-1 border-0 bg-transparent px-4 text-base text-white outline-none placeholder:text-slate-600 focus:ring-0"
              />
            </div>

            <p
              id="destination-email-help"
              className={`mt-2 text-xs ${
                destinationEmail && !emailIsValid
                  ? 'text-red-400'
                  : 'text-slate-500'
              }`}
            >
              {destinationEmail && !emailIsValid
                ? 'Enter a valid recipient email address.'
                : 'Enter the email address associated with the recipient account.'}
            </p>
          </div>
        )}

        <div>
          <label
            htmlFor="transaction-amount"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Amount
          </label>

          <div
            className={`flex h-[54px] overflow-hidden rounded-xl border bg-slate-900/80 transition focus-within:ring-2 ${
              amountExceedsMaximum ||
              amountHasTooManyDecimals ||
              amountHasMultipleSeparators
                ? 'border-red-500/50 focus-within:border-red-500/60 focus-within:ring-red-500/10'
                : amount && amountIsValid
                  ? 'border-emerald-500/40 focus-within:border-emerald-500/60 focus-within:ring-emerald-500/10'
                  : 'border-slate-700 focus-within:border-blue-500/60 focus-within:ring-blue-500/10'
            }`}
          >
            <div className="flex w-[68px] shrink-0 items-center justify-center border-r border-slate-700">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold ring-1 ${
                  amountExceedsMaximum ||
                  amountHasTooManyDecimals ||
                  amountHasMultipleSeparators
                    ? 'bg-red-500/15 text-red-400 ring-red-400/30'
                    : amount && amountIsValid
                      ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-400/30'
                      : 'bg-blue-500/10 text-blue-400 ring-blue-400/20'
                }`}
              >
                €
              </div>
            </div>

            <input
              id="transaction-amount"
              type="text"
              value={amount}
              onChange={handleAmountChange}
              required
              inputMode="decimal"
              placeholder="0,00"
              aria-describedby="transaction-amount-help"
              className="min-w-0 flex-1 border-0 bg-transparent px-4 text-base text-white outline-none placeholder:text-slate-600 focus:ring-0"
            />

            <div className="flex w-[72px] shrink-0 items-center justify-center border-l border-slate-700 text-sm font-semibold text-slate-400">
              EUR
            </div>
          </div>

          {amountExceedsMaximum ? (
            <p
              id="transaction-amount-help"
              className="mt-2 text-xs text-red-400"
            >
              Amount exceeds the transfer limit of €100,000.00.
            </p>
          ) : amountHasTooManyDecimals ? (
            <p
              id="transaction-amount-help"
              className="mt-2 text-xs text-red-400"
            >
              Please enter an amount with no more than two decimal places.
            </p>
          ) : amountHasMultipleSeparators ? (
            <p
              id="transaction-amount-help"
              className="mt-2 text-xs text-red-400"
            >
              Please enter a valid amount.
            </p>
          ) : (
            <p
              id="transaction-amount-help"
              className="mt-2 text-xs text-slate-500"
            >
              Enter the amount to transfer.
            </p>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-800/80">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <rect x="3" y="6" width="18" height="14" rx="2" />
                  <path d="M3 9h18" strokeLinecap="round" />
                  <path d="M16 14h2" strokeLinecap="round" />
                </svg>
              </div>

              <span className="text-xs text-slate-500">Available balance</span>
            </div>

            {isLoadingBalance ? (
              <span
                className="inline-block h-4 w-20 animate-pulse rounded-md bg-slate-700/70"
                aria-label="Loading available balance"
              />
            ) : (
              <span className="text-sm font-medium tabular-nums text-slate-300">
                {formatBalance(availableBalance)}
              </span>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="transaction-reference"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Reference{' '}
            <span className="font-normal text-slate-500">(optional)</span>
          </label>

          <div className="group flex h-[54px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900/80 transition focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/10">
            <div
              className="flex w-[54px] shrink-0 items-center justify-center border-r border-slate-700/80 text-slate-500 transition group-focus-within:border-blue-500/30 group-focus-within:text-blue-400"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8M8 17h6" />
              </svg>
            </div>

            <input
              id="transaction-reference"
              name="reference"
              type="text"
              value={reference}
              onChange={handleReferenceChange}
              maxLength={MAX_TRANSACTION_REFERENCE_LENGTH}
              autoComplete="off"
              placeholder="e.g. Rent, Gift, etc."
              aria-describedby="transaction-reference-help"
              className="min-w-0 flex-1 border-0 bg-transparent px-4 text-base text-white outline-none placeholder:text-slate-600 focus:ring-0"
            />
          </div>

          <p
            id="transaction-reference-help"
            className="mt-2 flex justify-between gap-3 text-xs text-slate-500"
          >
            <span>Optional · Maximum 140 characters</span>
            <span className="tabular-nums">
              {reference.length}/{MAX_TRANSACTION_REFERENCE_LENGTH}
            </span>
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300"
          >
            <svg
              viewBox="0 0 24 24"
              className="mt-0.5 h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
            </svg>

            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl border border-blue-400/30 bg-blue-600 px-5 text-base font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/50 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
        >
          {isSubmitting ? (
            <>
              <svg
                className="h-5 w-5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  className="opacity-25"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  d="M21 12a9 9 0 0 1-9 9"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
              Processing transfer...
            </>
          ) : (
            <>
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                aria-hidden="true"
              >
                <path
                  d="M22 2 11 13"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                <path
                  d="m22 2-7 20-4-9-9-4L22 2Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Send money
            </>
          )}
        </button>
      </form>
    </section>
  );
}

export default TransactionForm;
