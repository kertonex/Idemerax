import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import LoginForm from '../../../src/features/authentication/components/LoginForm';
import { AuthProvider } from '../../../src/features/authentication/context/AuthProvider';

/** Render the login form with its required application providers. */
function renderLoginForm() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginForm />
      </AuthProvider>
    </MemoryRouter>,
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

  it('shows a loading state while signing in', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      screen.getByRole('button', { name: 'Signing in...' }),
    ).toBeDisabled();
  });

  it('shows an error when login fails', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          detail: 'Invalid credentials.',
        }),
    });

    renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials.');
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled();
  });

  it('shows an error when the api cannot be reached', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to connect to API',
    );
  });

  it('requires an email address', async () => {
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeRequired();
    });
  });

  it('requires a password', async () => {
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByLabelText('Password')).toBeRequired();
    });
  });

  it('links to the registration page', async () => {
    renderLoginForm();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute(
        'href',
        '/register',
      );
    });
  });
});
