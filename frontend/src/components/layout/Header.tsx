import { logout } from '../../features/authentication/api/authentication';
import { useAuth } from '../../features/authentication/context/useAuth';

const AUTH_STORAGE_KEY = 'idemerax_auth';

function Header() {
  const { clearAccessToken } = useAuth();

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clearAccessToken();
      localStorage.setItem(AUTH_STORAGE_KEY, 'logout');
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950 px-6">
      <div>
        <p className="text-sm text-slate-400">Welcome back</p>
        <h1 className="text-lg font-semibold text-white">Idemerax</h1>
      </div>

      <button
        type="button"
        onClick={() => void handleLogout()}
        className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
      >
        Sign out
      </button>
    </header>
  );
}

export default Header;
