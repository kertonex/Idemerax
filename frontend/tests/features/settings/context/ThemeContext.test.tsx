import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThemeProvider } from '../../../../src/features/settings/context/ThemeProvider';
import { useTheme } from '../../../../src/features/settings/context/ThemeContext';

function ThemeContextConsumer() {
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        Set dark
      </button>
      <button type="button" onClick={() => setTheme('midnight')}>
        Set midnight
      </button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    cleanup();
  });

  it('uses the theme provided by ThemeProvider', () => {
    render(
      <ThemeProvider>
        <ThemeContextConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('current-theme')).toHaveTextContent('system');
  });

  it('updates the provider theme through the re-exported hook', () => {
    render(
      <ThemeProvider>
        <ThemeContextConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set dark' }));

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    expect(localStorage.getItem('idemerax_theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('supports the midnight theme through the re-exported hook', () => {
    render(
      <ThemeProvider>
        <ThemeContextConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set midnight' }));

    expect(screen.getByTestId('current-theme')).toHaveTextContent('midnight');
    expect(localStorage.getItem('idemerax_theme')).toBe('midnight');
    expect(document.documentElement.dataset.theme).toBe('midnight');
  });
});
