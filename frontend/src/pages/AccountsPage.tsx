import { useEffect, useState } from 'react';

import { getMyAccount, type Account } from '../features/accounts/api/accounts';
import AccountCard from '../features/accounts/components/AccountCard';
import { useAuth } from '../features/authentication/context/useAuth';

function AccountsPage() {
  const { accessToken } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoadingAccount, setIsLoadingAccount] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const authenticatedAccessToken = accessToken;

    async function loadAccount() {
      try {
        setIsLoadingAccount(true);
        setAccountError(null);

        const currentAccount = await getMyAccount(authenticatedAccessToken);
        setAccount(currentAccount);
      } catch (error) {
        setAccountError(
          error instanceof Error
            ? error.message
            : 'Unable to load your account.',
        );
      } finally {
        setIsLoadingAccount(false);
      }
    }

    void loadAccount();
  }, [accessToken]);

  const isLoading = accessToken ? isLoadingAccount : false;
  const error = accessToken ? accountError : 'Not authenticated.';

  if (isLoading) {
    return (
      <section className="space-y-8">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Account management
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Accounts
          </h1>
        </header>

        <div className="rounded-2xl border border-slate-700/80 bg-[#071522] p-6 text-sm text-slate-400">
          Loading your account...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-8">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Account management
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Accounts
          </h1>
        </header>

        <div
          role="alert"
          className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300"
        >
          {error}
        </div>
      </section>
    );
  }

  if (!account) {
    return (
      <section className="space-y-8">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Account management
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Accounts
          </h1>
        </header>

        <div className="rounded-2xl border border-slate-700/80 bg-[#071522] p-6 text-sm text-slate-400">
          No financial account is available.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Account management
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Accounts
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          Your financial account and available balance.
        </p>
      </header>

      <AccountCard account={account} />
    </section>
  );
}

export default AccountsPage;
