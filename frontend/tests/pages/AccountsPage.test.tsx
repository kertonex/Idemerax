import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import AccountsPage from '../../src/pages/AccountsPage';
import { AuthProvider } from '../../src/features/authentication/context/AuthProvider';
import { getCurrentUser } from '../../src/features/authentication/api/authentication';
import { getMyAccount } from '../../src/features/accounts/api/accounts';

vi.mock('../../src/features/authentication/api/authentication', () => ({
  getCurrentUser: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock('../../src/features/accounts/api/accounts', () => ({
  getMyAccount: vi.fn(),
}));

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockGetMyAccount = vi.mocked(getMyAccount);

const account = {
  id: 1,
  user_id: 42,
  balance: '1250.5000',
};

// Render the page with the authentication provider required by AccountsPage.
function renderAccountsPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AccountsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AccountsPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();

    mockGetCurrentUser.mockResolvedValue({
      id: 42,
      email: 'user@example.com',
      role: 'USER',
      is_active: true,
    });

    mockGetMyAccount.mockResolvedValue(account);
  });

  it('shows the loading state while the account is being loaded', async () => {
    sessionStorage.setItem('idemerax_access_token', 'test-access-token');

    mockGetMyAccount.mockReturnValue(new Promise(() => {}));

    renderAccountsPage();

    expect(screen.getByText('Loading your account...')).toBeInTheDocument();
  });

  it('loads and displays the authenticated users account', async () => {
    sessionStorage.setItem('idemerax_access_token', 'test-access-token');

    renderAccountsPage();

    expect(
      await screen.findByRole('heading', { name: 'Accounts' }),
    ).toBeInTheDocument();

    expect(screen.getByText('Your Financial Account')).toBeInTheDocument();
    expect(screen.getByText('Available Balance')).toBeInTheDocument();
    expect(screen.getByText('1.250,50 €')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();

    expect(mockGetMyAccount).toHaveBeenCalledWith('test-access-token');
  });

  it('shows an error when loading the account fails', async () => {
    sessionStorage.setItem('idemerax_access_token', 'test-access-token');

    mockGetMyAccount.mockRejectedValue(
      new Error('Unable to load your account.'),
    );

    renderAccountsPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load your account.',
    );
  });

  it('shows the fallback error when an unknown error occurs', async () => {
    sessionStorage.setItem('idemerax_access_token', 'test-access-token');

    mockGetMyAccount.mockRejectedValue('unexpected error');

    renderAccountsPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load your account.',
    );
  });

  it('shows the authentication error when no access token exists', async () => {
    mockGetCurrentUser.mockRejectedValue(new Error('No session'));

    renderAccountsPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not authenticated.',
    );

    expect(mockGetMyAccount).not.toHaveBeenCalled();
  });
});
