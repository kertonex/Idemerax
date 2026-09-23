import { useState } from 'react';
import { Link } from 'react-router';

import { login } from '../api/authentication';
import { useAuth } from '../context/useAuth';

/** Render the user login form. */
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setAccessToken } = useAuth();

  /** Handle login form submission. */
  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setIsLoading(true);

    try {
      const response = await login({
        email,
        password,
      });

      setAccessToken(response.access_token);
      localStorage.setItem('idemerax_auth', 'login');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to sign in. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-2xl border border-slate-800/80 bg-slate-900/75 p-7 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8"
    >
      <div className="mb-8">
        <div className="mb-5 flex items-center justify-between">
          <span className="rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Account access
          </span>

          <span className="text-xs text-slate-700">01</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-white sm:text-[28px]">
          Welcome back
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-400">
          Sign in securely to continue to your Idemerax account.
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-200"
          >
            Email
          </label>

          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="you@example.com"
            className="w-full rounded-xl border border-slate-700/90 bg-slate-950/80 px-4 py-3.5 text-sm text-white outline-none transition duration-200 placeholder:text-slate-700 hover:border-slate-600 focus:border-slate-500 focus:ring-4 focus:ring-indigo-500/[0.08]"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-200"
          >
            Password
          </label>

          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            placeholder="Enter your password"
            className="w-full rounded-xl border border-slate-700/90 bg-slate-950/80 px-4 py-3.5 text-sm text-white outline-none transition duration-200 placeholder:text-slate-700 hover:border-slate-600 focus:border-slate-500 focus:ring-4 focus:ring-indigo-500/[0.08]"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3.5"
        >
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-xs font-bold text-red-400"
              aria-hidden="true"
            >
              !
            </span>

            <p className="text-sm leading-5 text-red-400">{error}</p>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="group mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-white/[0.04] transition duration-200 hover:-translate-y-0.5 hover:bg-slate-200 hover:shadow-xl hover:shadow-white/[0.06] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{isLoading ? 'Signing in...' : 'Sign in'}</span>

        {!isLoading && (
          <span
            className="text-base transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          >
            →
          </span>
        )}
      </button>

      <div className="my-7 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-800" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
          or
        </span>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      <p className="text-center text-sm text-slate-500">
        Don&apos;t have an account?{' '}
        <Link
          to="/register"
          className="font-medium text-slate-200 transition hover:text-white"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}

export default LoginForm;
