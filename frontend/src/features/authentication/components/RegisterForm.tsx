import { useEffect, useRef, useState } from 'react';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnDePackage from '@zxcvbn-ts/language-de';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';
import { Link, useNavigate } from 'react-router';

import { register } from '../api/authentication';
import { useAuth } from '../context/useAuth';

const zxcvbn = new ZxcvbnFactory({
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
    ...zxcvbnDePackage.dictionary,
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  useLevenshteinDistance: true,
  translations: zxcvbnEnPackage.translations,
});

interface PasswordStrength {
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  segments: number;
  textClassName: string;
  segmentClassName: string;
  message: string;
}

function getTooShortStrength(): PasswordStrength {
  return {
    label: 'Too short',
    segments: 1,
    textClassName: 'text-red-400',
    segmentClassName: 'bg-red-400',
    message: 'Use at least 15 characters.',
  };
}

function getPasswordStrength(
  score: number,
  warning: string | null,
  suggestion: string | null,
): PasswordStrength {
  const feedbackMessage =
    warning || suggestion || 'Try a longer or less predictable password.';

  if (score === 4) {
    return {
      label: 'Strong',
      segments: 4,
      textClassName: 'text-emerald-400',
      segmentClassName: 'bg-emerald-400',
      message: 'Strong password.',
    };
  }

  if (score === 3) {
    return {
      label: 'Good',
      segments: 3,
      textClassName: 'text-green-400',
      segmentClassName: 'bg-green-400',
      message: feedbackMessage,
    };
  }

  if (score === 2) {
    return {
      label: 'Fair',
      segments: 2,
      textClassName: 'text-amber-400',
      segmentClassName: 'bg-amber-400',
      message: feedbackMessage,
    };
  }

  return {
    label: 'Weak',
    segments: 1,
    textClassName: 'text-orange-400',
    segmentClassName: 'bg-orange-400',
    message: feedbackMessage,
  };
}

/** Render the user registration form. */
function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordStrength, setPasswordStrength] =
    useState<PasswordStrength | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strengthCheckTimeoutRef = useRef<number | null>(null);

  const navigate = useNavigate();
  const { setAccessToken } = useAuth();

  useEffect(() => {
    if (strengthCheckTimeoutRef.current !== null) {
      window.clearTimeout(strengthCheckTimeoutRef.current);
      strengthCheckTimeoutRef.current = null;
    }

    if (!password || password.length < 15 || password.length > 128) {
      return;
    }

    strengthCheckTimeoutRef.current = window.setTimeout(() => {
      strengthCheckTimeoutRef.current = null;

      const result = zxcvbn.check(password, email ? [email] : []);

      setPasswordStrength(
        getPasswordStrength(
          result.score,
          result.feedback.warning,
          result.feedback.suggestions[0] ?? null,
        ),
      );
    }, 200);

    return () => {
      if (strengthCheckTimeoutRef.current !== null) {
        window.clearTimeout(strengthCheckTimeoutRef.current);
        strengthCheckTimeoutRef.current = null;
      }
    };
  }, [password, email]);

  const emailTooLong = email.length > 254;
  const passwordTooLong = password.length > 128;

  const displayedPasswordStrength = !password
    ? null
    : password.length < 15
      ? getTooShortStrength()
      : passwordStrength;

  /** Handle registration form submission. */
  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);

    if (email.length > 254 || password.length < 15 || password.length > 128) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await register({
        email,
        password,
      });

      setAccessToken(response.access_token);
      localStorage.setItem('idemerax_auth', 'login');
      navigate('/dashboard');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to create account. Please try again.',
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
            Account setup
          </span>

          <span className="text-xs text-slate-700">02</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-white sm:text-[28px]">
          Create your account
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-400">
          Set up your secure Idemerax account in a few seconds.
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-200"
            >
              Email
            </label>

            {email.length > 0 && (
              <span
                className={`text-xs tabular-nums ${
                  emailTooLong ? 'text-red-400' : 'text-slate-500'
                }`}
              >
                {email.length} / 254
              </span>
            )}
          </div>

          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            aria-describedby="email-feedback"
            placeholder="you@example.com"
            className={`w-full rounded-xl border bg-slate-950/80 px-4 py-3.5 text-sm text-white outline-none transition duration-200 placeholder:text-slate-700 hover:border-slate-600 focus:ring-4 ${
              emailTooLong
                ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/10'
                : 'border-slate-700/90 focus:border-slate-500 focus:ring-indigo-500/[0.08]'
            }`}
          />

          {emailTooLong && (
            <div
              id="email-feedback"
              className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/[0.04] px-3.5 py-3"
              role="alert"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 text-xs font-semibold text-red-400"
                  aria-hidden="true"
                >
                  !
                </span>

                <span className="text-xs font-medium text-red-400">
                  Email must be 254 characters or fewer.
                </span>
              </div>

              <span className="text-xs tabular-nums text-red-400/70">
                {email.length} / 254
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-200"
            >
              Password
            </label>

            {password.length > 0 && (
              <span
                className={`text-xs tabular-nums ${
                  passwordTooLong ? 'text-red-400' : 'text-slate-500'
                }`}
              >
                {password.length} / 128
              </span>
            )}
          </div>

          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={15}
            required
            aria-describedby="password-feedback"
            placeholder="Create a strong password"
            className={`w-full rounded-xl border bg-slate-950/80 px-4 py-3.5 text-sm text-white outline-none transition duration-200 placeholder:text-slate-700 hover:border-slate-600 focus:ring-4 ${
              passwordTooLong
                ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/10'
                : 'border-slate-700/90 focus:border-slate-500 focus:ring-indigo-500/[0.08]'
            }`}
          />

          {passwordTooLong ? (
            <div
              id="password-feedback"
              className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/[0.04] px-3.5 py-3"
              role="alert"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 text-xs font-semibold text-red-400"
                  aria-hidden="true"
                >
                  !
                </span>

                <span className="text-xs font-medium text-red-400">
                  Password must be 128 characters or fewer.
                </span>
              </div>

              <span className="text-xs tabular-nums text-red-400/70">
                {password.length} / 128
              </span>
            </div>
          ) : (
            displayedPasswordStrength && (
              <div
                id="password-feedback"
                className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3.5"
                aria-live="polite"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex flex-1 gap-1.5"
                    aria-label={`Password strength: ${displayedPasswordStrength.label}`}
                  >
                    {[1, 2, 3, 4].map((segment) => (
                      <div
                        key={segment}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          segment <= displayedPasswordStrength.segments
                            ? displayedPasswordStrength.segmentClassName
                            : 'bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>

                  <span
                    className={`min-w-12 text-right text-xs font-semibold ${displayedPasswordStrength.textClassName}`}
                  >
                    {displayedPasswordStrength.label}
                  </span>
                </div>

                <p className="text-xs leading-5 text-slate-400">
                  {displayedPasswordStrength.message}
                </p>

                {displayedPasswordStrength.label !== 'Strong' && (
                  <p className="text-xs leading-5 text-slate-600">
                    Longer, less predictable passwords are generally more
                    secure.
                  </p>
                )}
              </div>
            )
          )}
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
        disabled={isLoading || emailTooLong || passwordTooLong}
        className="group mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-white/[0.04] transition duration-200 hover:-translate-y-0.5 hover:bg-slate-200 hover:shadow-xl hover:shadow-white/[0.06] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{isLoading ? 'Creating account...' : 'Create account'}</span>

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
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-medium text-slate-200 transition hover:text-white"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

export default RegisterForm;
