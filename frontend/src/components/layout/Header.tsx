import { logout } from '../../features/authentication/api/authentication';
import { useAuth } from '../../features/authentication/context/useAuth';

const AUTH_STORAGE_KEY = 'idemerax_auth';

function Header() {
  const { currentUser, clearAccessToken } = useAuth();

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clearAccessToken();
      localStorage.setItem(AUTH_STORAGE_KEY, 'logout');
    }
  }

  const fullName =
    `${currentUser?.first_name ?? ''} ${currentUser?.last_name ?? ''}`.trim();

  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-800 bg-slate-950 px-4 py-2.5 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 sm:text-xs">
          Welcome back
        </p>

        <p
          className="mt-0.5 truncate text-base font-semibold leading-tight tracking-tight text-white sm:text-lg"
          title={fullName}
        >
          {fullName}
        </p>
      </div>

      <button
        type="button"
        onClick={() => void handleLogout()}
        className="min-h-10 shrink-0 rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 sm:px-4"
      >
        Sign out
      </button>
    </header>
  );
}

export default Header;
