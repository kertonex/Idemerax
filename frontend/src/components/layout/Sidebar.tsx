import { NavLink } from 'react-router';

import idemeraxLogo from '../../assets/idemerax-logo.svg';
import { logout } from '../../features/authentication/api/authentication';
import { useAuth } from '../../features/authentication/context/useAuth';
import AppIcon from '../icons/AppIcon';

const mainNavigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: 'dashboard' as const },
  { label: 'Accounts', to: '/accounts', icon: 'accounts' as const },
  { label: 'Cards', to: '/cards', icon: 'cards' as const },
  { label: 'Transactions', to: '/transactions', icon: 'transactions' as const },
];

const mobileNavigationItems = [
  ...mainNavigationItems,
  { label: 'Settings', to: '/settings', icon: 'settings' as const },
];

const AUTH_STORAGE_KEY = 'idemerax_auth';

function getUserDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
): string {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || email || 'Account';
}

function getUserInitials(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
): string {
  const initials = [firstName, lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim()[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return initials || email?.trim().charAt(0).toUpperCase() || 'U';
}

function Sidebar() {
  const { currentUser, clearAccessToken } = useAuth();
  const displayName = getUserDisplayName(
    currentUser?.first_name,
    currentUser?.last_name,
    currentUser?.email,
  );
  const initials = getUserInitials(
    currentUser?.first_name,
    currentUser?.last_name,
    currentUser?.email,
  );

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clearAccessToken();
      localStorage.setItem(AUTH_STORAGE_KEY, 'logout');
    }
  }

  const userIdentity = (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-indigo-400/25 bg-indigo-500/20 text-xs font-semibold text-indigo-100">
        {initials}
      </span>
      <span className="min-w-0 truncate text-sm font-medium text-slate-200" title={displayName}>
        {displayName}
      </span>
    </div>
  );

  const logoutButton = (
    <button
      type="button"
      onClick={() => void handleLogout()}
      aria-label="Sign out"
      title="Sign out"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <AppIcon name="log-out" className="h-[17px] w-[17px]" />
    </button>
  );

  return (
    <>
      {/* Mobile: keep the complete original top navigation visible while scrolling. */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/90 bg-slate-950/95 text-white shadow-[0_8px_28px_rgba(2,6,23,0.18)] backdrop-blur-xl md:hidden">
        <div className="mx-auto flex min-h-[60px] w-full items-center justify-between gap-2 px-3 sm:min-h-[68px] sm:px-5">
          <NavLink
            to="/dashboard"
            aria-label="Idemerax dashboard"
            className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <img src={idemeraxLogo} alt="" className="h-8 w-8" />
            <span className="text-base font-semibold tracking-[-0.025em]">Idemerax</span>
          </NavLink>

          <div className="flex min-w-0 items-center gap-2">
            {userIdentity}
            {logoutButton}
          </div>
        </div>

        <nav aria-label="Main navigation" className="w-full px-2 pb-2 sm:px-4 sm:pb-3">
          <div className="grid w-full grid-cols-5 gap-1">
            {mobileNavigationItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `inline-flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center text-[10px] font-medium leading-tight transition-colors ${
                    isActive
                      ? 'border-blue-500/25 bg-blue-500/10 text-white'
                      : 'border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900/80 hover:text-slate-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <AppIcon
                      name={item.icon}
                      className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-300' : 'text-slate-500'}`}
                    />
                    <span className="min-w-0 whitespace-normal break-words">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      {/* Tablet: compact left rail. */}
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-white md:flex lg:hidden">
        <NavLink to="/dashboard" aria-label="Idemerax dashboard" className="flex h-20 items-center justify-center border-b border-slate-800">
          <img src={idemeraxLogo} alt="Idemerax" className="h-9 w-9" />
        </NavLink>
        <nav aria-label="Main navigation" className="flex flex-1 flex-col items-center gap-2 px-2 py-5">
          {mainNavigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.label}
              title={item.label}
              className={({ isActive }) =>
                `flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                  isActive ? 'bg-blue-500/10 text-blue-300' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                }`
              }
            >
              <AppIcon name={item.icon} className="h-5 w-5" />
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            aria-label="Settings"
            title="Settings"
            className={({ isActive }) =>
              `mt-auto flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                isActive ? 'bg-blue-500/10 text-blue-300' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`
            }
          >
            <AppIcon name="settings" className="h-5 w-5" />
          </NavLink>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-400/25 bg-indigo-500/20 text-xs font-semibold text-indigo-100" title={displayName}>
            {initials}
          </div>
          {logoutButton}
        </nav>
      </aside>

      {/* Desktop: original full-width vertical sidebar. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-white lg:flex">
        <div className="border-b border-slate-800 p-6">
          <NavLink to="/dashboard" aria-label="Idemerax dashboard" className="flex items-center gap-2.5">
            <img src={idemeraxLogo} alt="" className="h-8 w-8" />
            <span className="text-lg font-semibold">Idemerax</span>
          </NavLink>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-6 px-4 py-5">
          <div>
            <p className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">Main</p>
            <div className="space-y-1">
              {mainNavigationItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                    }`
                  }
                >
                  <AppIcon name={item.icon} className="h-[18px] w-[18px]" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>

        <div className="border-t border-slate-800 p-4">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `mb-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`
            }
          >
            <AppIcon name="settings" className="h-[18px] w-[18px]" />
            Settings
          </NavLink>
          <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-4">
            {userIdentity}
            {logoutButton}
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
