import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/features/authentication/context/AuthProvider';
import RegisterPage from '../../src/pages/RegisterPage';

describe('RegisterPage', () => {
  it('renders the registration form', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument();
  });
});
