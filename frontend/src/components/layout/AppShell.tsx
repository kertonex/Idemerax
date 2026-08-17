import type { ReactNode } from 'react';

import Header from './Header';
import MainContent from './MainContent';
import Sidebar from './Sidebar';

interface AppShellProps {
  children: ReactNode;
}

function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header />

          <MainContent>{children}</MainContent>
        </div>
      </div>
    </div>
  );
}

export default AppShell;
