import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { Theme } from '../api/settings';
import { ThemeContext } from './ThemeContext';

const THEME_STORAGE_KEY = 'idemerax_theme';

function getStoredTheme(): Theme {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  if (
    storedTheme === 'system' ||
    storedTheme === 'dark' ||
    storedTheme === 'midnight'
  ) {
    return storedTheme;
  }

  return 'system';
}

function applyThemeClass(theme: Theme): void {
  const root = document.documentElement;

  root.classList.remove(
    'theme-system',
    'theme-dim',
    'theme-dark',
    'theme-midnight',
  );

  root.classList.add(`theme-${theme}`);
  root.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  const setTheme = useCallback((nextTheme: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setThemeState(nextTheme);
  }, []);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY) {
        return;
      }

      const nextTheme = event.newValue;

      if (
        nextTheme === 'system' ||
        nextTheme === 'dark' ||
        nextTheme === 'midnight'
      ) {
        setThemeState(nextTheme);
      }
    }

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
