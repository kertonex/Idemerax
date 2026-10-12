import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from './locales/de/translation.json';
import en from './locales/en/translation.json';

const LANGUAGE_STORAGE_KEY = 'idemerax_language';

export const SUPPORTED_LANGUAGES = ['en', 'de'] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function getStoredLanguage(): AppLanguage {
  const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);

  if (
    storedLanguage &&
    SUPPORTED_LANGUAGES.includes(storedLanguage as AppLanguage)
  ) {
    return storedLanguage as AppLanguage;
  }

  return 'en';
}

const initialLanguage = getStoredLanguage();

document.documentElement.lang = initialLanguage;

i18n.on('languageChanged', (language) => {
  const supportedLanguage = SUPPORTED_LANGUAGES.includes(
    language as AppLanguage,
  )
    ? (language as AppLanguage)
    : 'en';

  document.documentElement.lang = supportedLanguage;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, supportedLanguage);
});

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
