import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AuthProvider } from '../../src/features/authentication/context/AuthProvider';
import LoginPage from '../../src/pages/LoginPage';

function renderLoginPage() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
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
