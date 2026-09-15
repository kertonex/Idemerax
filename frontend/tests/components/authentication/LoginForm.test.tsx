import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider } from '../../../src/features/authentication/context/AuthProvider';
import LoginForm from '../../../src/features/authentication/components/LoginForm';

function renderLoginForm() {
  return render(
    <AuthProvider>
      <LoginForm />
    </AuthProvider>,
  );
}

describe('LoginForm', () => {
  it('renders email and password fields', () => {
    renderLoginForm();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders the sign in button', () => {
    renderLoginForm();

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('allows entering email and password', async () => {
    const user = userEvent.setup();

    renderLoginForm();

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');

    await user.type(emailInput, 'user@example.com');
    await user.type(passwordInput, 'correct-password');

    expect(emailInput).toHaveValue('user@example.com');
    expect(passwordInput).toHaveValue('correct-password');
  });

  it('submits login credentials to the api', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'test-token',
          token_type: 'bearer',
        }),
    });

    renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'correct-password',
        }),
      }),
    );
  });

  it('requires an email address', () => {
    renderLoginForm();

    expect(screen.getByLabelText('Email')).toBeRequired();
  });

  it('requires a password', () => {
    renderLoginForm();

    expect(screen.getByLabelText('Password')).toBeRequired();
  });
});
