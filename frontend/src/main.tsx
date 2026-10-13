import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import './i18n';
import App from './App';
import './index.css';

const THEME_STORAGE_KEY = 'idemerax_theme';

type Theme = 'system' | 'dark' | 'midnight';

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

function applyInitialTheme(): void {
  const root = document.documentElement;
  const theme = getStoredTheme();

  root.classList.remove(
    'theme-system',
    'theme-dim',
    'theme-dark',
    'theme-midnight',
  );

  root.classList.add(`theme-${theme}`);
  root.dataset.theme = theme;
}

applyInitialTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
