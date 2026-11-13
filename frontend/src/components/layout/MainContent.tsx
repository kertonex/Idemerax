import type { ReactNode } from 'react';

interface MainContentProps {
  children: ReactNode;
}

function MainContent({ children }: MainContentProps) {
  return (
    <main className="min-w-0 flex-1">
      <div className="mx-auto w-full max-w-7xl min-w-0 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
        {children}
      </div>
    </main>
  );
}

export default MainContent;
