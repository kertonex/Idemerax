import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import LoginPage from '../../src/pages/LoginPage';

describe('LoginPage', () => {
  it('renders the Idemerax branding', () => {
    render(<LoginPage />);

    expect(screen.getByText('Idemerax')).toBeInTheDocument();
  });

  it('renders the login form', () => {
    render(<LoginPage />);

    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
});
