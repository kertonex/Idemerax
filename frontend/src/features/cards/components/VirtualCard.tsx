import idemeraxLogo from '../../../assets/idemerax-logo.svg';
import type { ManagedCard } from '../api/cards';

interface VirtualCardProps {
  card: ManagedCard;
  cardholderName: string;
}

function VirtualCard({ card, cardholderName }: VirtualCardProps) {
  const isActive = card.status === 'ACTIVE';
  const isClosed = card.status === 'CLOSED';
  const stateLabel = isActive ? 'ACTIVE' : isClosed ? 'CLOSED' : 'INACTIVE';

  return (
    <div
      className={`relative isolate flex h-auto min-h-[15rem] w-full min-w-0 max-w-[25rem] flex-col justify-between gap-4 overflow-hidden rounded-2xl border p-4 shadow-2xl transition-colors duration-300 sm:aspect-[1.586/1] sm:min-h-[15rem] sm:p-5 ${
        isActive
          ? 'border-emerald-300/40 bg-gradient-to-br from-[#12443f] via-[#071d27] to-[#101b35] shadow-emerald-950/30'
          : isClosed
            ? 'border-rose-300/40 bg-gradient-to-br from-[#3a1e2b] via-[#171522] to-[#111827] grayscale-[0.65] opacity-90'
            : 'border-amber-200/40 bg-gradient-to-br from-[#353548] via-[#151d2b] to-[#111827] saturate-50'
      }`}
      aria-label={`Virtual demo debit card ending in ${card.last_four}, ${stateLabel.toLowerCase()}`}
    >
      <div className="pointer-events-none absolute -right-12 -top-16 -z-10 h-48 w-48 rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -right-3 -top-7 -z-10 h-32 w-32 rounded-full border border-white/10" />

      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={idemeraxLogo} alt="Idemerax" className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-wide text-white">
              Idemerax
            </p>
            <p className="mt-1 text-[0.6rem] font-medium uppercase tracking-[0.12em] text-cyan-100/70">
              Virtual debit · Demo
            </p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6rem] font-bold tracking-[0.08em] shadow-lg ${
            isActive
              ? 'border-emerald-200/40 bg-emerald-300/20 text-emerald-100'
              : isClosed
                ? 'border-rose-200/40 bg-rose-400/20 text-rose-100'
                : 'border-amber-200/40 bg-amber-300/15 text-amber-100'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'animate-pulse bg-emerald-300' : isClosed ? 'bg-rose-300' : 'bg-amber-300'}`}
          />
          {stateLabel}
        </span>
      </div>

      {!isActive && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          aria-hidden="true"
        >
          <span
            className={`-rotate-12 rounded-lg border-2 px-4 py-1.5 text-base font-black tracking-[0.18em] ${isClosed ? 'border-rose-300/60 text-rose-200/90' : 'border-amber-200/60 text-amber-100/90'}`}
          >
            {isClosed ? 'CLOSED' : 'INACTIVE'}
          </span>
        </div>
      )}

      <div className="min-w-0 space-y-3">
        <div
          className="flex items-center gap-3 text-white/80"
          aria-hidden="true"
        >
          <svg viewBox="0 0 32 24" className="h-6 w-8 shrink-0" fill="none">
            <rect x="1" y="1" width="30" height="22" rx="4" fill="#d8e7d8" />
            <path
              d="M11 1v22M21 1v22M1 8h30M1 16h30"
              stroke="#8ba79b"
              strokeWidth="1.2"
            />
          </svg>
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none">
            <path
              d="M8 8a6 6 0 0 1 0 8M12 5a10 10 0 0 1 0 14M16 2a14 14 0 0 1 0 20"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.7"
            />
          </svg>
        </div>

        <div
          className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-sm leading-5 tracking-[0.06em] text-white sm:gap-x-3 sm:text-base"
          aria-label={`Card number ending in ${card.last_four}`}
        >
          <span className="whitespace-nowrap">••••</span>
          <span className="whitespace-nowrap">••••</span>
          <span className="whitespace-nowrap">••••</span>
          <span className="whitespace-nowrap">{card.last_four}</span>
        </div>

        <div className="flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row sm:items-end sm:gap-4">
          <div className="min-w-0 sm:flex-1">
            <p className="mb-1 text-[0.5625rem] uppercase tracking-[0.16em] text-white/55">
              Cardholder
            </p>
            <p className="break-words text-xs font-semibold uppercase leading-snug tracking-[0.08em] text-white [overflow-wrap:anywhere] sm:text-sm">
              {cardholderName || 'Idemerax User'}
            </p>
          </div>
          <div className="min-w-0 max-w-full sm:shrink-0 sm:text-right">
            <p className="text-[0.5625rem] font-semibold uppercase tracking-[0.12em] text-cyan-100/70">
              Demo only
            </p>
            <p className="mt-1 text-[0.625rem] leading-snug text-white/55">
              Not a payment instrument
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VirtualCard;
