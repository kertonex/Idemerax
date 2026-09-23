import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { AuthProvider } from '../../../src/features/authentication/context/AuthProvider';
import AppShell from '../../../src/components/layout/AppShell';

describe('AppShell', () => {
  it('renders the application shell', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <AppShell>
            <p>Dashboard content</p>
          </AppShell>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getAllByText('Idemerax')).toHaveLength(2);
    expect(screen.getByText('Welcome back')).toBeInTheDocument();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Cards')).toBeInTheDocument();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
    expect(screen.getByText('Reliability')).toBeInTheDocument();

    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });
});
