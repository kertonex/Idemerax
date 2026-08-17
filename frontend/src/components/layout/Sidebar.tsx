import { NavLink } from 'react-router';

const mainNavigationItems = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Accounts', to: '/accounts' },
  { label: 'Cards', to: '/cards' },
  { label: 'Transactions', to: '/transactions' },
];

const systemNavigationItems = [{ label: 'Reliability', to: '/reliability' }];

function Sidebar() {
  return (
    <aside className="flex min-h-screen w-64 flex-col border-r border-slate-800 bg-slate-950">
      <div className="p-6">
        <span className="text-lg font-semibold">Idemerax</span>
      </div>

      <nav className="flex-1 space-y-6 px-4">
        <div>
          <p className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            Main
          </p>

          <div className="space-y-1">
            {mainNavigationItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        <div>
          <p className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            System
          </p>

          <div className="space-y-1">
            {systemNavigationItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                  }`
                }
              >
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
            `block rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`
          }
        >
          Settings
        </NavLink>
      </div>
    </aside>
  );
}

export default Sidebar;
