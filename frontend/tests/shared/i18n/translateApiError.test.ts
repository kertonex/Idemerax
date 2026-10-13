import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import { translateApiError } from '../../../src/shared/i18n/translateApiError';

type TranslationMock = (key: string) => string;

function createTranslationMock() {
  const mock = vi.fn<TranslationMock>((key) => `translated:${key}`);

  return {
    mock,
    t: mock as unknown as TFunction,
  };
}

describe('translateApiError', () => {
  it.each([
    ['invalid credentials.', 'errors.invalidCredentials'],
    ['invalid credentials', 'errors.invalidCredentials'],
    ['not authenticated.', 'errors.notAuthenticated'],
    ['not authenticated', 'errors.notAuthenticated'],
    ['insufficient funds.', 'errors.insufficientFunds'],
    ['insufficient funds', 'errors.insufficientFunds'],
    ['unable to load your account.', 'errors.unableToLoadAccount'],
    ['unable to load account.', 'transactions.unableToLoadAccount'],
    ['unable to load account email.', 'transactions.unableToLoadEmail'],
    ['unable to load your settings.', 'settings.unableToLoad'],
    ['unable to save your changes.', 'errors.unableToSave'],
    ['unable to process transaction.', 'transactions.unableToProcess'],
    [
      'the provided iban does not belong to idemerax.',
      'transactions.bankNotIdemerax',
    ],
    [
      'you cannot transfer money to your own account.',
      'transactions.sameAccount',
    ],
    ['the new passwords do not match.', 'settings.passwordMismatch'],
    [
      'enter a valid recipient email address.',
      'transactions.validRecipientEmail',
    ],
    ['please enter a valid amount.', 'transactions.invalidAmount'],
  ])('translates "%s" using "%s"', (message, key) => {
    const { t } = createTranslationMock();

    expect(translateApiError(message, t)).toBe(`translated:${key}`);
  });

  it.each([
    'Network error',
    'A network error occurred.',
    'NETWORK ERROR',
    'Unexpected network connection error.',
  ])('translates network errors: "%s"', (message) => {
    const { t } = createTranslationMock();

    expect(translateApiError(message, t)).toBe('translated:errors.network');
  });

  it.each([
    'Email already exists.',
    'This email is already registered.',
    'EMAIL ALREADY IN USE',
  ])('translates email-already-registered errors: "%s"', (message) => {
    const { t } = createTranslationMock();

    expect(translateApiError(message, t)).toBe(
      'translated:errors.emailAlreadyRegistered',
    );
  });

  it.each([
    'Invalid IBAN',
    'Invalid IBAN provided.',
    'The INVALID IBAN was entered.',
  ])('translates invalid IBAN errors: "%s"', (message) => {
    const { t } = createTranslationMock();

    expect(translateApiError(message, t)).toBe('translated:errors.invalidIban');
  });

  it.each([
    'Insufficient balance',
    'Insufficient account balance.',
    'The account has insufficient available balance.',
  ])('translates insufficient-balance errors: "%s"', (message) => {
    const { t } = createTranslationMock();

    expect(translateApiError(message, t)).toBe(
      'translated:errors.insufficientFunds',
    );
  });

  it('normalizes capitalization and whitespace for known messages', () => {
    const { t } = createTranslationMock();

    expect(translateApiError('  INVALID   CREDENTIALS.  ', t)).toBe(
      'translated:errors.invalidCredentials',
    );
  });

  it('returns the original message when no rule matches', () => {
    const { t } = createTranslationMock();
    const message = 'A completely unknown API error.';

    expect(translateApiError(message, t)).toBe(message);
  });

  it('preserves the original whitespace of an unknown message', () => {
    const { t } = createTranslationMock();
    const message = '  An unknown error with  extra spacing.  ';

    expect(translateApiError(message, t)).toBe(message);
  });

  it('does not translate a message that mentions a network without an error', () => {
    const { t } = createTranslationMock();
    const message = 'The network is available.';

    expect(translateApiError(message, t)).toBe(message);
  });

  it('does not translate an email message without "already"', () => {
    const { t } = createTranslationMock();
    const message = 'Please verify your email address.';

    expect(translateApiError(message, t)).toBe(message);
  });

  it('does not translate an insufficient-credit message as insufficient funds', () => {
    const { t } = createTranslationMock();
    const message = 'The account has insufficient credit.';

    expect(translateApiError(message, t)).toBe(message);
  });

  it('calls the translation function with the matching key', () => {
    const { mock, t } = createTranslationMock();

    translateApiError('Invalid credentials.', t);

    expect(mock).toHaveBeenCalledExactlyOnceWith('errors.invalidCredentials');
  });

  it('does not call the translation function for unknown messages', () => {
    const { mock, t } = createTranslationMock();
    const message = 'Unknown API response.';

    expect(translateApiError(message, t)).toBe(message);
    expect(mock).not.toHaveBeenCalled();
  });
});
