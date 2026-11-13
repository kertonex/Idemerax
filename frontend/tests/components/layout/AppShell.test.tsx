import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { AuthProvider } from '../../../src/features/authentication/context/AuthProvider';
import AppShell from '../../../src/components/layout/AppShell';

describe('AppShell', () => {
  it('renders the responsive application shell and its navigation', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <AppShell>
            <p>Dashboard content</p>
          </AppShell>
        </MemoryRouter>
      </AuthProvider>,
    );

    // Mobile and desktop layouts each expose the product wordmark.
    expect(screen.getAllByText('Idemerax')).toHaveLength(2);

    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Accounts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cards').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Transactions').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);

    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });
});
