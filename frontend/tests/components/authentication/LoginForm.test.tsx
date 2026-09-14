import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LoginForm from '../../../src/features/authentication/components/LoginForm';

describe('LoginForm', () => {
  it('renders email and password fields', () => {
    render(<LoginForm />);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders the sign in button', () => {
    render(<LoginForm />);

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('allows entering email and password', async () => {
    const user = userEvent.setup();

    render(<LoginForm />);

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');

    await user.type(emailInput, 'user@example.com');
    await user.type(passwordInput, 'correct-password');

    expect(emailInput).toHaveValue('user@example.com');
    expect(passwordInput).toHaveValue('correct-password');
  });

  it('does not submit the form', async () => {
    const user = userEvent.setup();

    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByLabelText('Email')).toHaveValue('user@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('correct-password');
  });

  it('requires an email address', () => {
    render(<LoginForm />);

    expect(screen.getByLabelText('Email')).toBeRequired();
  });

  it('requires a password', () => {
    render(<LoginForm />);

    expect(screen.getByLabelText('Password')).toBeRequired();
  });
});
