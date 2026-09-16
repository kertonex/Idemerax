import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import RegisterForm from '../../../src/features/authentication/components/RegisterForm';

describe('RegisterForm', () => {
  /** Render the registration form inside a router context. */
  function renderRegisterForm() {
    return render(
      <MemoryRouter>
        <RegisterForm />
      </MemoryRouter>,
    );
  }

  it('renders the registration form', () => {
    renderRegisterForm();

    expect(
      screen.getByRole('heading', { name: 'Create account' }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        'Create your Idemerax account with your email and password.',
      ),
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

  it('links to the login page', async () => {
    const user = userEvent.setup();

    renderRegisterForm();

    const link = screen.getByRole('link', { name: 'Sign in' });

    expect(link).toHaveAttribute('href', '/login');

    await user.click(link);

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
