import type { ReactNode } from 'react';

import MainContent from './MainContent';
import Sidebar from './Sidebar';

interface AppShellProps {
  children: ReactNode;
}

function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-slate-950 text-white md:flex-row">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MainContent>{children}</MainContent>
      </div>
    </div>
  );
}

export default AppShell;
