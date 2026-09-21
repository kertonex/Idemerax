import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';

import RegisterForm from '../../../src/features/authentication/components/RegisterForm';
import { register } from '../../../src/features/authentication/api/authentication';
import { AuthProvider } from '../../../src/features/authentication/context/AuthProvider';
import { useAuth } from '../../../src/features/authentication/context/useAuth';

vi.mock('../../../src/features/authentication/api/authentication', () => ({
  register: vi.fn(),
}));

function renderRegisterForm() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RegisterForm />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function LocationDisplay() {
  const location = useLocation();

  return <div data-testid="location">{location.pathname}</div>;
}

function AuthStateDisplay() {
  const { accessToken } = useAuth();

  return <div data-testid="access-token">{accessToken ?? ''}</div>;
}

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

  it('shows the password strength indicator for a sufficiently long password', async () => {
    const user = userEvent.setup();

    renderRegisterForm();

    await user.type(screen.getByLabelText('Password'), 'TestPassword123!');

    await waitFor(
      () => {
        expect(screen.getByLabelText(/Password strength:/)).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });

  it('shows a too-short password strength state', async () => {
    const user = userEvent.setup();

    renderRegisterForm();

    await user.type(screen.getByLabelText('Password'), 'short');

    expect(screen.getByText('Too short')).toBeInTheDocument();
    expect(screen.getByText('Use at least 15 characters.')).toBeInTheDocument();
  });

  it('rejects an email address longer than 254 characters', async () => {
    const user = userEvent.setup();

    renderRegisterForm();

    const email = `${'a'.repeat(246)}@test.com`;
    const emailInput = screen.getByLabelText('Email');

    await user.type(emailInput, email);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Email must be 254 characters or fewer.',
    );

    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeDisabled();
  });

  it('rejects a password longer than 128 characters', async () => {
    const user = userEvent.setup();

    renderRegisterForm();

    const passwordInput = screen.getByLabelText('Password');

    await user.type(passwordInput, 'a'.repeat(129));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Password must be 128 characters or fewer.',
    );

    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeDisabled();
  });

  it('does not submit when the password is shorter than 15 characters', async () => {
    const user = userEvent.setup();

    renderRegisterForm();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'short');

    const form = screen
      .getByRole('button', { name: 'Create account' })
      .closest('form');

    expect(form).not.toBeNull();

    fireEvent.submit(form!);

    await waitFor(() => {
      expect(register).not.toHaveBeenCalled();
    });
  });

  it('submits registration credentials to the api', async () => {
    const user = userEvent.setup();

    vi.mocked(register).mockResolvedValue({
      access_token: 'test-token',
      token_type: 'bearer',
    });

    renderRegistrationFlow();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(register).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'TestPassword123!',
    });
  });

  it('shows a loading state while creating the account', async () => {
    const user = userEvent.setup();

    vi.mocked(register).mockImplementation(() => new Promise(() => {}));

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

    vi.mocked(register).mockResolvedValue({
      access_token: 'test-token',
      token_type: 'bearer',
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

    vi.mocked(register).mockResolvedValue({
      access_token: 'test-token',
      token_type: 'bearer',
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

    vi.mocked(register).mockRejectedValue(
      new Error('Email address is already registered.'),
    );

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

  it('shows the api error when registration fails with a network error', async () => {
    const user = userEvent.setup();

    vi.mocked(register).mockRejectedValue(new Error('Network error'));

    renderRegisterForm();

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });
});
