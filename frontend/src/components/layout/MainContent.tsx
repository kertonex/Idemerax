import type { ReactNode } from 'react';

interface MainContentProps {
  children: ReactNode;
}

function MainContent({ children }: MainContentProps) {
  return (
    <main className="min-w-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-7xl p-6 lg:p-8">{children}</div>
    </main>
  );
}

export default MainContent;
