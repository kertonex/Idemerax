import type { ReactNode } from 'react';

import idemeraxLogo from '../../assets/idemerax-logo.svg';

interface AuthLayoutProps {
  children: ReactNode;
}

function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#020617] px-4 py-8 text-white sm:px-6 sm:py-10">
      {/* Ambient lighting */}
      <div
        className="pointer-events-none absolute left-1/2 top-[-22rem] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-indigo-500/[0.07] blur-3xl"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute bottom-[-24rem] left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-cyan-400/[0.045] blur-3xl"
        aria-hidden="true"
      />

      {/* Fine grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.022]"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Center glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.025] blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-10 m-auto flex w-full max-w-[430px] flex-col items-center">
        {/* Brand */}
        <div className="mb-9 text-center">
          <div className="mb-5 flex items-center justify-center gap-3">
            <div
              className="relative flex h-12 w-12 items-center justify-center"
              aria-hidden="true"
            >
              <img src={idemeraxLogo} alt="" className="h-12 w-12" />

              {/* Soft logo glow */}
              <div
                className="pointer-events-none absolute inset-3 rounded-full bg-indigo-400/[0.08] blur-xl"
                aria-hidden="true"
              />
            </div>

            <span className="text-[22px] font-semibold tracking-[-0.035em] text-white">
              Idemerax
            </span>
          </div>

          <p className="text-[13px] tracking-wide text-slate-500">
            Transaction infrastructure, built for reliability.
          </p>
        </div>

        {children}
      </div>
    </main>
  );
}

export default AuthLayout;
