import type { TFunction } from 'i18next';

/** Translate known API error messages while preserving unknown messages. */
export function translateApiError(message: string, t: TFunction): string {
  const normalized = message.trim().replace(/\s+/g, ' ').toLowerCase();

  const knownMessages: Record<string, string> = {
    'invalid credentials.': 'errors.invalidCredentials',
    'invalid credentials': 'errors.invalidCredentials',
    'not authenticated.': 'errors.notAuthenticated',
    'not authenticated': 'errors.notAuthenticated',
    'insufficient funds.': 'errors.insufficientFunds',
    'insufficient funds': 'errors.insufficientFunds',
    'unable to load your account.': 'errors.unableToLoadAccount',
    'unable to load account.': 'transactions.unableToLoadAccount',
    'unable to load account email.': 'transactions.unableToLoadEmail',
    'unable to load your settings.': 'settings.unableToLoad',
    'unable to save your changes.': 'errors.unableToSave',
    'unable to process transaction.': 'transactions.unableToProcess',
    'the provided iban does not belong to idemerax.':
      'transactions.bankNotIdemerax',
    'you cannot transfer money to your own account.':
      'transactions.sameAccount',
    'the new passwords do not match.': 'settings.passwordMismatch',
    'enter a valid recipient email address.':
      'transactions.validRecipientEmail',
    'please enter a valid amount.': 'transactions.invalidAmount',
  };

  const key = knownMessages[normalized];

  if (key) {
    return t(key);
  }

  if (normalized.includes('network') && normalized.includes('error')) {
    return t('errors.network');
  }

  if (normalized.includes('email') && normalized.includes('already')) {
    return t('errors.emailAlreadyRegistered');
  }

  if (normalized.includes('invalid iban')) {
    return t('errors.invalidIban');
  }

  if (normalized.includes('insufficient') && normalized.includes('balance')) {
    return t('errors.insufficientFunds');
  }

  return message;
}
