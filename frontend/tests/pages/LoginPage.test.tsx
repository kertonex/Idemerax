import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import LoginPage from '../../src/pages/LoginPage';
import { AuthProvider } from '../../src/features/authentication/context/AuthProvider';

/** Render the login page with its required application providers. */
function renderLoginPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('renders the Idemerax branding', () => {
    renderLoginPage();

    expect(screen.getByText('Idemerax')).toBeInTheDocument();
  });

  it('renders the login form', () => {
    renderLoginPage();

    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
});
