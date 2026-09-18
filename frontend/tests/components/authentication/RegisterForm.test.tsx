import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';

import RegisterForm from '../../../src/features/authentication/components/RegisterForm';
import { AuthProvider } from '../../../src/features/authentication/context/AuthProvider';
import { useAuth } from '../../../src/features/authentication/context/useAuth';

/** Render the registration form with its required application providers. */
function renderRegisterForm() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RegisterForm />
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Render the current route for testing navigation. */
function LocationDisplay() {
  const location = useLocation();

  return <div data-testid="location">{location.pathname}</div>;
}

/** Render the authentication state for testing successful registration. */
function AuthStateDisplay() {
  const { accessToken } = useAuth();

  return <div data-testid="access-token">{accessToken ?? ''}</div>;
}

/** Render the registration form with route and authentication state displays. */
function renderRegistrationFlow() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RegisterForm />
        <LocationDisplay />
        <AuthStateDisplay />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RegisterForm', () => {
  it('renders the registration form', () => {
    renderRegisterForm();

    expect(
      screen.getByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument();

    expect(
      screen.getByText('Set up your secure Idemerax account in a few seconds.'),
    ).toBeInTheDocument();
  });

  it('renders the email and password fields', () => {
    renderRegisterForm();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders the create account button', () => {
    renderRegisterForm();

    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeInTheDocument();
  });

  it('allows entering an email address and password', async () => {
    const user = userEvent.setup();

    renderRegisterForm();

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');

    await user.type(emailInput, 'user@example.com');
    await user.type(passwordInput, 'TestPassword123!');

    expect(emailInput).toHaveValue('user@example.com');
    expect(passwordInput).toHaveValue('TestPassword123!');
  });

  it('requires an email address', () => {
    renderRegisterForm();

    expect(screen.getByLabelText('Email')).toBeRequired();
  });

  it('requires a password', () => {
    renderRegisterForm();

    expect(screen.getByLabelText('Password')).toBeRequired();
  });

  it('links to the login page', () => {
    renderRegisterForm();

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('submits registration credentials to the api', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'test-token',
          token_type: 'bearer',
        }),
    });

    renderRegistrationFlow();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'TestPassword123!',
        }),
      }),
    );
  });

  it('shows a loading state while creating the account', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    renderRegisterForm();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      screen.getByRole('button', { name: 'Creating account...' }),
    ).toBeDisabled();
  });

  it('sets the access token after successful registration', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'test-token',
          token_type: 'bearer',
        }),
    });

    renderRegistrationFlow();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByTestId('access-token')).toHaveTextContent(
      'test-token',
    );
  });

  it('redirects to the dashboard after successful registration', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'test-token',
          token_type: 'bearer',
        }),
    });

    renderRegistrationFlow();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/dashboard',
    );
  });

  it('shows an error when registration fails', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          detail: 'Email address is already registered.',
        }),
    });

    renderRegisterForm();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Email address is already registered.',
    );

    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).not.toBeDisabled();
  });

  it('shows an error when the api cannot be reached', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    renderRegisterForm();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to connect to API',
    );
  });
});
