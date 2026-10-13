import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../../../../src/features/settings/context/ThemeProvider';

import { useTheme } from '../../../../src/features/settings/context/ThemeContext';

const THEME_STORAGE_KEY = 'idemerax_theme';

function ThemeConsumer() {
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <span data-testid="current-theme">{theme}</span>

      <button type="button" onClick={() => setTheme('system')}>
        System
      </button>

      <button type="button" onClick={() => setTheme('dark')}>
        Dark
      </button>

      <button type="button" onClick={() => setTheme('midnight')}>
        Midnight
      </button>
    </div>
  );
}

function renderThemeProvider() {
  return render(
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>,
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();

    document.documentElement.className = '';
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('uses system as the default theme', () => {
    renderThemeProvider();

    expect(screen.getByTestId('current-theme').textContent).toBe('system');
  });

  it.each(['system', 'dark', 'midnight'] as const)(
    'loads the stored %s theme',
    (theme) => {
      localStorage.setItem(THEME_STORAGE_KEY, theme);

      renderThemeProvider();

      expect(screen.getByTestId('current-theme').textContent).toBe(theme);
    },
  );

  it('falls back to system when the stored theme is invalid', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'invalid-theme');

    renderThemeProvider();

    expect(screen.getByTestId('current-theme').textContent).toBe('system');
  });

  it.each([
    ['System', 'system'],
    ['Dark', 'dark'],
    ['Midnight', 'midnight'],
  ] as const)('changes the theme to %s', (buttonLabel, expectedTheme) => {
    renderThemeProvider();

    fireEvent.click(screen.getByRole('button', { name: buttonLabel }));

    expect(screen.getByTestId('current-theme').textContent).toBe(expectedTheme);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(expectedTheme);

    expect(document.documentElement).toHaveClass(`theme-${expectedTheme}`);

    expect(document.documentElement.dataset.theme).toBe(expectedTheme);
  });

  it('updates the theme when another tab changes local storage', () => {
    renderThemeProvider();

    fireEvent(
      window,
      new StorageEvent('storage', {
        key: THEME_STORAGE_KEY,
        newValue: 'midnight',
      }),
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('midnight');
  });

  it('ignores storage events for unrelated keys', () => {
    renderThemeProvider();

    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'unrelated_key',
        newValue: 'dark',
      }),
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('system');
  });

  it('ignores unsupported themes received through storage events', () => {
    renderThemeProvider();

    fireEvent(
      window,
      new StorageEvent('storage', {
        key: THEME_STORAGE_KEY,
        newValue: 'dim',
      }),
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('system');
  });

  it('throws when useTheme is used outside ThemeProvider', () => {
    function InvalidConsumer() {
      useTheme();

      return null;
    }

    expect(() => render(<InvalidConsumer />)).toThrow(
      'useTheme must be used within ThemeProvider.',
    );
  });
});
