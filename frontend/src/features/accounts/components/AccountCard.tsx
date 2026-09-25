import type { Account } from '../api/accounts';

interface AccountCardProps {
  account: Account;
}

// Format the API balance for display in the account overview.
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

function AccountCard({ account }: AccountCardProps) {
  return (
    <article className="relative isolate w-full min-w-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-[#071522] shadow-2xl shadow-black/30">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_55%,rgba(37,99,235,0.2),transparent_34%),radial-gradient(circle_at_52%_105%,rgba(30,64,175,0.12),transparent_42%)]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 top-1/3 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl sm:h-80 sm:w-80"
      />

      <div className="relative min-w-0 p-5 sm:p-7 lg:p-9">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-600/20 shadow-lg shadow-blue-950/30 sm:h-14 sm:w-14">
            <svg
              aria-hidden="true"
              className="h-5.5 w-5.5 text-blue-300 sm:h-7 sm:w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 9.5 12 3l9 6.5"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 9.5h14"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.5 10.5V18m4.25-7.5V18m4.5-7.5V18m4.25-7.5V18"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.5 18.5h17M2.5 20.5h19"
              />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 sm:gap-x-3">
              <h2 className="min-w-0 break-words text-base font-semibold tracking-tight text-white sm:text-2xl">
                Your Financial Account
              </h2>

              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 sm:px-3 sm:text-xs">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.9)] sm:h-2 sm:w-2"
                />
                Active
              </span>
            </div>

            <p className="mt-1.5 max-w-lg text-xs leading-5 text-slate-400 sm:text-sm">
              Your account is ready for secure transactions.
            </p>
          </div>
        </div>

        <div className="relative mt-8 sm:mt-12">
          {/* Balance */}
          <div className="relative z-10 min-w-0 sm:max-w-[58%]">
            <p className="text-xs font-medium text-slate-400 sm:text-sm">
              Available Balance
            </p>

            <p className="mt-2 max-w-full break-words text-[clamp(2.35rem,10vw,4.75rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-white">
              {formatBalance(account.balance)}
            </p>

            <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 sm:text-sm">
              EUR
            </p>
          </div>

          {/* Bank illustration */}
          <div
            aria-hidden="true"
            className="relative mx-auto mt-6 w-full max-w-[16rem] opacity-80 sm:absolute sm:bottom-[-3rem] sm:right-[-1rem] sm:mt-0 sm:w-[46%] sm:max-w-[24rem] lg:right-0 lg:w-[42%] lg:max-w-[28rem]"
          >
            <svg
              className="h-auto w-full"
              fill="none"
              viewBox="0 0 420 330"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient
                  id="bank-roof"
                  x1="125"
                  y1="30"
                  x2="335"
                  y2="180"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0" stopColor="#93c5fd" stopOpacity="0.95" />
                  <stop offset="0.45" stopColor="#3b82f6" stopOpacity="0.72" />
                  <stop offset="1" stopColor="#1e40af" stopOpacity="0.2" />
                </linearGradient>

                <linearGradient
                  id="bank-columns"
                  x1="130"
                  y1="120"
                  x2="310"
                  y2="270"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0" stopColor="#93c5fd" stopOpacity="0.72" />
                  <stop offset="0.5" stopColor="#3b82f6" stopOpacity="0.48" />
                  <stop offset="1" stopColor="#1e3a8a" stopOpacity="0.16" />
                </linearGradient>

                <radialGradient id="bank-light">
                  <stop offset="0" stopColor="#2563eb" stopOpacity="0.3" />
                  <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
                </radialGradient>

                <filter
                  id="bank-shadow"
                  x="-40%"
                  y="-40%"
                  width="180%"
                  height="190%"
                >
                  <feGaussianBlur
                    in="SourceAlpha"
                    stdDeviation="7"
                    result="blur"
                  />
                  <feOffset dy="10" result="offset" />
                  <feColorMatrix
                    in="offset"
                    type="matrix"
                    values="0 0 0 0 0.01 0 0 0 0 0.08 0 0 0 0 0.25 0 0 0 0.55 0"
                    result="shadow"
                  />
                  <feMerge>
                    <feMergeNode in="shadow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <ellipse
                cx="270"
                cy="165"
                rx="155"
                ry="125"
                fill="url(#bank-light)"
              />

              <ellipse
                cx="275"
                cy="302"
                rx="110"
                ry="15"
                fill="#2563eb"
                opacity="0.1"
              />

              <g filter="url(#bank-shadow)">
                <path
                  d="M112 102 263 29l124 64-146 79-129-70Z"
                  fill="url(#bank-roof)"
                  stroke="#60a5fa"
                  strokeOpacity="0.58"
                  strokeWidth="2"
                />

                <path
                  d="m112 102 129 70 146-79"
                  stroke="#60a5fa"
                  strokeOpacity="0.45"
                  strokeWidth="2"
                />

                <path
                  d="m137 102 104 56 116-63-95-49-125 56Z"
                  fill="#60a5fa"
                  fillOpacity="0.06"
                  stroke="#93c5fd"
                  strokeOpacity="0.22"
                />

                <path
                  d="M145 119v130h225V101l-129 71-96-53Z"
                  fill="url(#bank-columns)"
                  stroke="#60a5fa"
                  strokeOpacity="0.28"
                  strokeWidth="1.5"
                />

                <path
                  d="m241 172 129-71v148l-129 32V172Z"
                  fill="#1d4ed8"
                  fillOpacity="0.07"
                />

                <g stroke="url(#bank-columns)">
                  <path
                    d="M163 132v104"
                    strokeWidth="13"
                    strokeLinecap="round"
                  />
                  <path
                    d="M202 153v88"
                    strokeWidth="13"
                    strokeLinecap="round"
                  />
                  <path
                    d="M241 173v67"
                    strokeWidth="13"
                    strokeLinecap="round"
                  />
                  <path
                    d="M280 153v80"
                    strokeWidth="13"
                    strokeLinecap="round"
                  />
                  <path
                    d="M319 132v94"
                    strokeWidth="13"
                    strokeLinecap="round"
                  />
                </g>

                <g stroke="#bfdbfe" strokeOpacity="0.25">
                  <path d="M160 132v104" strokeWidth="3" />
                  <path d="M199 153v88" strokeWidth="3" />
                  <path d="M238 173v67" strokeWidth="3" />
                  <path d="M277 153v80" strokeWidth="3" />
                  <path d="M316 132v94" strokeWidth="3" />
                </g>

                <path
                  d="M137 236h236v13H137z"
                  fill="#60a5fa"
                  fillOpacity="0.22"
                />

                <path
                  d="M128 249h253v13H128z"
                  fill="#60a5fa"
                  fillOpacity="0.16"
                />

                <path
                  d="M119 262h271v15H119z"
                  fill="#60a5fa"
                  fillOpacity="0.21"
                />

                <path
                  d="M108 277h291v15H108z"
                  fill="#60a5fa"
                  fillOpacity="0.12"
                />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </article>
  );
}

export default AccountCard;
