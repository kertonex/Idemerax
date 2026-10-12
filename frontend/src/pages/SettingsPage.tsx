import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnDePackage from '@zxcvbn-ts/language-de';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';
import {
  changePassword,
  getSettings,
  updateNotifications,
  updatePreferences,
  updateProfile,
  type Theme,
} from '../features/settings/api/settings';
import { useAuth } from '../features/authentication/context/useAuth';
import { useTheme } from '../features/settings/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import type { AppLanguage } from '../i18n';
import { translateApiError } from '../shared/i18n/translateApiError';
const MAX_NAME_LENGTH = 35;
const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 128;
const NOTIFICATIONS_ENABLED = false;
const zxcvbn = new ZxcvbnFactory({
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
    ...zxcvbnDePackage.dictionary,
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  useLevenshteinDistance: true,
  translations: zxcvbnEnPackage.translations,
});
type SettingsTab = 'profile' | 'security' | 'preferences' | 'notifications';
interface PasswordStrength {
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  segments: number;
  textClassName: string;
  segmentClassName: string;
  message: string;
}
function getTooShortStrength(): PasswordStrength {
  return {
    label: 'Too short',
    segments: 1,
    textClassName: 'text-red-400',
    segmentClassName: 'bg-red-400',
    message: 'Use at least 15 characters.',
  };
}

function getPasswordStrength(
  score: number,
  warning: string | null,
  suggestion: string | null,
): PasswordStrength {
  const feedbackMessage =
    warning || suggestion || 'Try a longer or less predictable password.';

  if (score === 4) {
    return {
      label: 'Strong',
      segments: 4,
      textClassName: 'text-emerald-400',
      segmentClassName: 'bg-emerald-400',
      message: 'Strong password.',
    };
  }
  if (score === 3) {
    return {
      label: 'Good',
      segments: 3,
      textClassName: 'text-green-400',
      segmentClassName: 'bg-green-400',
      message: feedbackMessage,
    };
  }
  if (score === 2) {
    return {
      label: 'Fair',
      segments: 2,
      textClassName: 'text-amber-400',
      segmentClassName: 'bg-amber-400',
      message: feedbackMessage,
    };
  }
  return {
    label: 'Weak',
    segments: 1,
    textClassName: 'text-orange-400',
    segmentClassName: 'bg-orange-400',
    message: feedbackMessage,
  };
}
function getInitialTab(): SettingsTab {
  return 'profile';
}
function SettingsPage() {
  const { t, i18n } = useTranslation();
  const currentLanguage: AppLanguage =
    i18n.resolvedLanguage === 'de' ? 'de' : 'en';
  const { accessToken, currentUser, setCurrentUser } = useAuth();
  const { setTheme: setGlobalTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab);
  const [firstName, setFirstName] = useState(currentUser?.first_name ?? '');
  const [lastName, setLastName] = useState(currentUser?.last_name ?? '');
  const [theme, setTheme] = useState<Theme>('system');
  const [notifyTransactionCompleted, setNotifyTransactionCompleted] =
    useState(true);
  const [notifyMoneyReceived, setNotifyMoneyReceived] = useState(true);
  const [notifyTransactionFailed, setNotifyTransactionFailed] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStrength, setPasswordStrength] =
    useState<PasswordStrength | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const [notificationsSaving, setNotificationsSaving] = useState(false);
  const [visiblePassword, setVisiblePassword] = useState<
    'current' | 'new' | 'confirm' | null
  >(null);
  const [currentPasswordFocused, setCurrentPasswordFocused] = useState(false);
  const passwordTimerRef = useRef<number | null>(null);
  const strengthCheckTimeoutRef = useRef<number | null>(null);
  const isProfileComplete = Boolean(currentUser?.profile_complete);
  const translations = {
    settings: t('settings.title'),
    profile: t('profile.title'),
    security: t('security.title'),
    preferences: t('settings.preferences'),
    preferencesDescription: t('settings.preferencesDescription'),
    notifications: t('notifications.title'),
    createProfile: t('settings.setupTitle'),
    completeProfile: t('settings.setupDescription'),
    firstName: t('settings.firstName'),
    lastName: t('settings.lastName'),
    email: t('settings.email'),
    continue: t('common.continue'),
    save: t('common.save'),
    saved: t('settings.saved'),
    theme: t('settings.theme'),
    system: t('settings.system'),
    dark: t('settings.dark'),
    midnight: t('settings.midnight'),
    currentPassword: t('settings.currentPassword'),
    newPassword: t('settings.newPassword'),
    confirmPassword: t('settings.confirmPassword'),
    changePassword: t('settings.changePassword'),
    passwordChanged: t('settings.passwordChanged'),
    transactionCompleted: t('settings.transactionCompleted'),
    moneyReceived: t('settings.moneyReceived'),
    transactionFailed: t('settings.transactionFailed'),
  };
  const settingsLoadDependenciesRef = useRef({
    i18n,
    t,
    setGlobalTheme,
  });

  useEffect(() => {
    settingsLoadDependenciesRef.current = {
      i18n,
      t,
      setGlobalTheme,
    };
  }, [i18n, t, setGlobalTheme]);
  useEffect(() => {
    if (!accessToken || !currentUser?.profile_complete) {
      return;
    }

    const token: string = accessToken;
    let cancelled = false;

    async function loadSettings() {
      try {
        setPageError(null);
        const settings = await getSettings(token);
        if (cancelled) {
          return;
        }
        setFirstName(settings.profile.first_name ?? '');
        setLastName(settings.profile.last_name ?? '');
        const storedTheme = settings.preferences.theme;
        const supportedTheme: Theme =
          storedTheme === 'dark' || storedTheme === 'midnight'
            ? storedTheme
            : 'system';
        setTheme(supportedTheme);
        const dependencies = settingsLoadDependenciesRef.current;
        if (
          dependencies.i18n.resolvedLanguage !== settings.preferences.language
        ) {
          await dependencies.i18n.changeLanguage(settings.preferences.language);
        }
        if (cancelled) {
          return;
        }
        setNotifyTransactionCompleted(
          settings.notifications.notify_transaction_completed,
        );
        setNotifyMoneyReceived(settings.notifications.notify_money_received);
        setNotifyTransactionFailed(
          settings.notifications.notify_transaction_failed,
        );
        dependencies.setGlobalTheme(supportedTheme);
      } catch (error) {
        if (!cancelled) {
          const { t } = settingsLoadDependenciesRef.current;
          setPageError(
            error instanceof Error
              ? translateApiError(error.message, t)
              : t('settings.settingsLoadFailed'),
          );
        }
      }
    }
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentUser?.profile_complete]);
  useEffect(() => {
    return () => {
      if (passwordTimerRef.current !== null) {
        window.clearTimeout(passwordTimerRef.current);
      }
      if (strengthCheckTimeoutRef.current !== null) {
        window.clearTimeout(strengthCheckTimeoutRef.current);
      }
    };
  }, []);
  /*
   * Password strength uses the same debounced approach as RegisterForm.
   *
   * zxcvbn is relatively expensive, so it must not run synchronously
   * for every single keystroke.
   */
  useEffect(() => {
    if (strengthCheckTimeoutRef.current !== null) {
      window.clearTimeout(strengthCheckTimeoutRef.current);
      strengthCheckTimeoutRef.current = null;
    }
    if (
      !newPassword ||
      newPassword.length < MIN_PASSWORD_LENGTH ||
      newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      return;
    }
    strengthCheckTimeoutRef.current = window.setTimeout(() => {
      strengthCheckTimeoutRef.current = null;
      const result = zxcvbn.check(
        newPassword,
        currentUser?.email ? [currentUser.email] : [],
      );
      setPasswordStrength(
        getPasswordStrength(
          result.score,
          result.feedback.warning,
          result.feedback.suggestions[0] ?? null,
        ),
      );
    }, 200);
    return () => {
      if (strengthCheckTimeoutRef.current !== null) {
        window.clearTimeout(strengthCheckTimeoutRef.current);
        strengthCheckTimeoutRef.current = null;
      }
    };
  }, [newPassword, currentUser?.email]);
  function showPasswordTemporarily(field: 'current' | 'new' | 'confirm') {
    if (passwordTimerRef.current !== null) {
      window.clearTimeout(passwordTimerRef.current);
    }
    setVisiblePassword(field);
    passwordTimerRef.current = window.setTimeout(() => {
      setVisiblePassword(null);
      passwordTimerRef.current = null;
    }, 2000);
  }
  function validateProfile(): boolean {
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    if (!normalizedFirstName || !normalizedLastName) {
      setProfileError(t('settings.profileFirstLastRequired'));
      return false;
    }
    if (
      normalizedFirstName.length > MAX_NAME_LENGTH ||
      normalizedLastName.length > MAX_NAME_LENGTH
    ) {
      setProfileError(
        t('settings.profileNameTooLong', { max: MAX_NAME_LENGTH }),
      );
      return false;
    }
    setProfileError(null);
    return true;
  }
  async function handleConfirmProfile() {
    if (!accessToken || !validateProfile()) {
      return;
    }
    setIsSavingProfile(true);
    setProfileError(null);
    try {
      const profile = await updateProfile(accessToken, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      setFirstName(profile.first_name ?? '');
      setLastName(profile.last_name ?? '');
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          first_name: profile.first_name,
          last_name: profile.last_name,
          profile_complete: true,
        });
      }
      setIsReviewOpen(false);
      setProfileSuccess(t('settings.profileConfirmed'));
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? translateApiError(error.message, t)
          : t('settings.profileSaveFailed'),
      );
    } finally {
      setIsSavingProfile(false);
    }
  }
  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    setPasswordError(null);
    setPasswordSuccess(null);
    if (
      newPassword.length < MIN_PASSWORD_LENGTH ||
      newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      setPasswordError(
        t('settings.passwordLength', {
          min: MIN_PASSWORD_LENGTH,
          max: MAX_PASSWORD_LENGTH,
        }),
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.passwordMismatch'));
      return;
    }
    setIsChangingPassword(true);
    try {
      await changePassword(accessToken, {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStrength(null);
      setCurrentPasswordFocused(false);
      setVisiblePassword(null);
      setPasswordSuccess(translations.passwordChanged);
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? translateApiError(error.message, t)
          : t('settings.passwordChangeFailed'),
      );
    } finally {
      setIsChangingPassword(false);
    }
  }
  async function handleLanguageChange(nextLanguage: AppLanguage) {
    if (nextLanguage === currentLanguage) {
      return;
    }
    setIsChangingLanguage(true);
    setPageError(null);
    try {
      if (accessToken) {
        await updatePreferences(accessToken, {
          language: nextLanguage,
          theme,
        });
      }
      await i18n.changeLanguage(nextLanguage);
    } catch (error) {
      await i18n.changeLanguage(currentLanguage);
      setPageError(
        error instanceof Error
          ? translateApiError(error.message, t)
          : t('settings.languageChangeFailed'),
      );
    } finally {
      setIsChangingLanguage(false);
    }
  }
  async function handlePreferencesChange(nextTheme: Theme) {
    if (!accessToken) {
      return;
    }
    const previousTheme = theme;
    setTheme(nextTheme);
    setGlobalTheme(nextTheme);
    setPreferencesSaving(true);
    setPageError(null);
    try {
      await updatePreferences(accessToken, {
        language: currentLanguage,
        theme: nextTheme,
      });
    } catch (error) {
      // Keep the interface and local theme consistent with the saved preference.
      setTheme(previousTheme);
      setGlobalTheme(previousTheme);
      setPageError(
        error instanceof Error
          ? translateApiError(error.message, t)
          : t('settings.preferencesSaveFailed'),
      );
    } finally {
      setPreferencesSaving(false);
    }
  }
  async function handleNotificationsChange(
    completed: boolean,
    received: boolean,
    failed: boolean,
  ) {
    if (!accessToken) {
      return;
    }
    const previousValues = {
      completed: notifyTransactionCompleted,
      received: notifyMoneyReceived,
      failed: notifyTransactionFailed,
    };
    setNotifyTransactionCompleted(completed);
    setNotifyMoneyReceived(received);
    setNotifyTransactionFailed(failed);
    setNotificationsSaving(true);
    setPageError(null);
    try {
      await updateNotifications(accessToken, {
        notify_transaction_completed: completed,
        notify_money_received: received,
        notify_transaction_failed: failed,
      });
    } catch (error) {
      // Roll back the optimistic UI update if the server rejects the change.
      setNotifyTransactionCompleted(previousValues.completed);
      setNotifyMoneyReceived(previousValues.received);
      setNotifyTransactionFailed(previousValues.failed);
      setPageError(
        error instanceof Error
          ? translateApiError(error.message, t)
          : t('settings.notificationsSaveFailed'),
      );
    } finally {
      setNotificationsSaving(false);
    }
  }
  /*
   * Same behavior as RegisterForm:
   *
   * - empty password -> no strength display
   * - below 15 characters -> immediate red "Too short"
   * - 15+ characters -> use the debounced zxcvbn result
   */
  const displayedPasswordStrength = !newPassword
    ? null
    : newPassword.length < MIN_PASSWORD_LENGTH
      ? getTooShortStrength()
      : newPassword.length > MAX_PASSWORD_LENGTH
        ? null
        : passwordStrength;
  if (!isProfileComplete) {
    return (
      <main className="flex min-h-[100svh] w-full items-start justify-center overflow-x-hidden bg-slate-950 px-4 py-6 text-white sm:items-center sm:px-6 sm:py-10">
        <div className="w-full max-w-2xl">
          <div className="mb-6 sm:mb-8">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-sm font-bold text-white shadow-xl shadow-black/20">
              I
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {t('settings.profileSetup')}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {translations.createProfile}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
              {translations.completeProfile}
            </p>
          </div>
          <section className="overflow-hidden rounded-3xl border border-slate-800/90 bg-slate-900/80 shadow-2xl shadow-black/30">
            <div className="p-5 sm:p-8">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="profile-first-name"
                    className="block text-sm font-medium text-slate-200"
                  >
                    {translations.firstName}
                  </label>
                  <input
                    id="profile-first-name"
                    value={firstName}
                    maxLength={MAX_NAME_LENGTH}
                    autoComplete="given-name"
                    onChange={(event) => setFirstName(event.target.value)}
                    disabled={isSavingProfile}
                    className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-slate-500 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p className="text-right text-xs tabular-nums text-slate-600">
                    {firstName.length}/{MAX_NAME_LENGTH}
                  </p>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="profile-last-name"
                    className="block text-sm font-medium text-slate-200"
                  >
                    {translations.lastName}
                  </label>
                  <input
                    id="profile-last-name"
                    value={lastName}
                    maxLength={MAX_NAME_LENGTH}
                    autoComplete="family-name"
                    onChange={(event) => setLastName(event.target.value)}
                    disabled={isSavingProfile}
                    className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-slate-500 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p className="text-right text-xs tabular-nums text-slate-600">
                    {lastName.length}/{MAX_NAME_LENGTH}
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                <label
                  htmlFor="profile-email"
                  className="block text-sm font-medium text-slate-200"
                >
                  {translations.email}
                </label>
                <input
                  id="profile-email"
                  value={currentUser?.email ?? ''}
                  readOnly
                  tabIndex={-1}
                  className="min-h-12 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-base text-slate-500 outline-none"
                />
                <p className="text-xs text-slate-600">
                  {t('settings.authenticationEmailHelp')}
                </p>
              </div>
              <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300"
                    aria-hidden="true"
                  >
                    !
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-amber-200">
                      {t('settings.demoTitle')}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-amber-100/70">
                      {t('settings.demoWarning')}
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-amber-100">
                      {t('settings.demoOnly')}
                    </p>
                  </div>
                </div>
              </div>
              {profileError && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-sm leading-5 text-red-300"
                >
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div
                  role="status"
                  className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 text-sm leading-5 text-emerald-300"
                >
                  {profileSuccess}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  if (validateProfile()) {
                    setIsReviewOpen(true);
                  }
                }}
                disabled={
                  isSavingProfile || !firstName.trim() || !lastName.trim()
                }
                className="mt-6 min-h-12 w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 sm:w-auto sm:min-w-40"
              >
                {translations.continue}
              </button>
            </div>
          </section>
        </div>
        {isReviewOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-confirmation-title"
              className="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-black/50 sm:p-7"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t('settings.confirmationEyebrow')}
              </p>
              <h2
                id="profile-confirmation-title"
                className="mt-2 text-2xl font-semibold text-white"
              >
                {t('settings.confirmProfile')}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {t('settings.confirmationDescription')}
              </p>
              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs text-slate-500">
                    {translations.firstName}
                  </p>
                  <p className="mt-1 break-words text-base font-medium text-white">
                    {firstName.trim()}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs text-slate-500">
                    {translations.lastName}
                  </p>
                  <p className="mt-1 break-words text-base font-medium text-white">
                    {lastName.trim()}
                  </p>
                </div>
              </div>
              {profileError && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-sm text-red-300"
                >
                  {profileError}
                </div>
              )}
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setIsReviewOpen(false)}
                  disabled={isSavingProfile}
                  className="min-h-12 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('settings.goBack')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmProfile()}
                  disabled={isSavingProfile}
                  className="min-h-12 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {isSavingProfile
                    ? t('settings.confirming')
                    : t('settings.confirmProfile')}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }
  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'profile', label: translations.profile },
    { id: 'security', label: translations.security },
    { id: 'preferences', label: translations.preferences },
    { id: 'notifications', label: translations.notifications },
  ];
  return (
    <section className="w-full min-w-0 space-y-6 pb-8 sm:space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t('settings.accountLabel')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {translations.settings}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          {t('settings.pageDescription')}
        </p>
      </header>
      {pageError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-sm leading-5 text-red-300"
        >
          {pageError}
        </div>
      )}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav
          className="flex min-w-max gap-1 rounded-2xl border border-slate-800 bg-slate-900/70 p-1"
          aria-label={t('settings.tabNavigation')}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-11 rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      {activeTab === 'profile' && (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 sm:p-8">
          <div className="max-w-3xl">
            <h2 className="text-xl font-semibold text-white">
              {translations.profile}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {t('settings.profileDescription')}
            </p>
            <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="settings-first-name"
                  className="block text-sm font-medium text-slate-200"
                >
                  {translations.firstName}
                </label>
                <input
                  id="settings-first-name"
                  value={firstName}
                  disabled
                  tabIndex={-1}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-base text-slate-500"
                />
              </div>
              <div>
                <label
                  htmlFor="settings-last-name"
                  className="block text-sm font-medium text-slate-200"
                >
                  {translations.lastName}
                </label>
                <input
                  id="settings-last-name"
                  value={lastName}
                  disabled
                  tabIndex={-1}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-base text-slate-500"
                />
              </div>
            </div>
            <div className="mt-5">
              <label
                htmlFor="settings-email"
                className="block text-sm font-medium text-slate-200"
              >
                {translations.email}
              </label>
              <input
                id="settings-email"
                value={currentUser?.email ?? ''}
                readOnly
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => event.preventDefault()}
                className="mt-2 min-h-12 w-full cursor-default rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-base text-slate-500"
              />
            </div>
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-sm leading-6 text-slate-400">
                {t('settings.personalDetailsLocked')}
              </p>
            </div>
          </div>
        </section>
      )}
      {activeTab === 'security' && (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 sm:p-8">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold text-white">
              {translations.security}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {t('settings.securityDescription')}
            </p>
            <form onSubmit={handlePasswordChange} className="mt-7 space-y-5">
              {[
                {
                  id: 'current-password',
                  label: translations.currentPassword,
                  value: currentPassword,
                  setValue: setCurrentPassword,
                  field: 'current' as const,
                },
                {
                  id: 'new-password',
                  label: translations.newPassword,
                  value: newPassword,
                  setValue: setNewPassword,
                  field: 'new' as const,
                },
                {
                  id: 'confirm-password',
                  label: translations.confirmPassword,
                  value: confirmPassword,
                  setValue: setConfirmPassword,
                  field: 'confirm' as const,
                },
              ].map((field) => (
                <div key={field.id}>
                  <label
                    htmlFor={field.id}
                    className="block text-sm font-medium text-slate-200"
                  >
                    {field.label}
                  </label>
                  <div className="relative mt-2">
                    <input
                      id={field.id}
                      name={
                        field.field === 'current'
                          ? 'idemerax-security-current-entry'
                          : field.field === 'new'
                            ? 'idemerax-security-new-entry'
                            : 'idemerax-security-confirm-entry'
                      }
                      type={
                        field.field === 'current' && !currentPasswordFocused
                          ? 'text'
                          : visiblePassword === field.field
                            ? 'text'
                            : 'password'
                      }
                      value={field.value}
                      autoComplete={
                        field.field === 'current' ? 'off' : 'new-password'
                      }
                      readOnly={
                        field.field === 'current' && !currentPasswordFocused
                      }
                      onFocus={() => {
                        if (field.field === 'current') {
                          setCurrentPasswordFocused(true);
                        }
                      }}
                      onChange={(event) => field.setValue(event.target.value)}
                      minLength={
                        field.field === 'current'
                          ? undefined
                          : MIN_PASSWORD_LENGTH
                      }
                      maxLength={MAX_PASSWORD_LENGTH}
                      required
                      className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-14 text-base text-white outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-indigo-500/10"
                    />
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        if (field.field === 'current') {
                          setCurrentPasswordFocused(true);
                        }
                        showPasswordTemporarily(field.field);
                      }}
                      aria-label={t('settings.showPasswordTemporarily', {
                        field: field.label.toLowerCase(),
                      })}
                      className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-white"
                    >
                      {visiblePassword === field.field ? '◉' : '○'}
                    </button>
                  </div>
                  {field.field === 'new' && displayedPasswordStrength && (
                    <div className="mt-3">
                      <div
                        className="flex gap-1.5"
                        aria-label={t('settings.passwordStrengthAria', {
                          strength: t(
                            `settings.passwordStrength.${displayedPasswordStrength.label === 'Too short' ? 'tooShort' : displayedPasswordStrength.label.toLowerCase()}`,
                          ),
                        })}
                      >
                        {[1, 2, 3, 4].map((segment) => (
                          <div
                            key={segment}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                              segment <= displayedPasswordStrength.segments
                                ? displayedPasswordStrength.segmentClassName
                                : 'bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="mt-2 flex items-start justify-between gap-3">
                        <p
                          className={`text-xs font-semibold ${displayedPasswordStrength.textClassName}`}
                        >
                          {t(
                            `settings.passwordStrength.${displayedPasswordStrength.label === 'Too short' ? 'tooShort' : displayedPasswordStrength.label.toLowerCase()}`,
                          )}
                        </p>
                        <p className="text-right text-xs leading-5 text-slate-500">
                          {displayedPasswordStrength.message}
                        </p>
                      </div>
                      {displayedPasswordStrength.label !== 'Strong' && (
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {t('settings.passwordStrength.extraHelp')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {passwordError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-sm text-red-300"
                >
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 text-sm text-emerald-300"
                >
                  {passwordSuccess}
                </div>
              )}
              <button
                type="submit"
                disabled={
                  isChangingPassword ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
                className="min-h-12 w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 sm:w-auto"
              >
                {isChangingPassword
                  ? t('settings.changingPassword')
                  : translations.changePassword}
              </button>
            </form>
          </div>
        </section>
      )}
      {activeTab === 'preferences' && (
        <section className="overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/60 shadow-xl shadow-black/10">
          <div className="border-b border-slate-800/80 px-5 py-6 sm:px-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-400/[0.08] text-indigo-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-1.7 2.94-.08-.02a1.65 1.65 0 0 0-1.7.58l-.05.07h-3.4l-.04-.08a1.65 1.65 0 0 0-1.43-.83 1.65 1.65 0 0 0-.9.26l-.08.05-2.94-1.7.02-.08a1.65 1.65 0 0 0-.58-1.7l-.07-.05v-3.4l.08-.04a1.65 1.65 0 0 0 .57-1.7l-.02-.08 1.7-2.94.08.02a1.65 1.65 0 0 0 1.7-.58l.05-.07h3.4l.04.08a1.65 1.65 0 0 0 1.7.57l.08-.02 2.94 1.7-.02.08a1.65 1.65 0 0 0 .58 1.7l.07.05v3.4Z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                  {translations.preferences}
                </h2>
                <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-400">
                  {translations.preferencesDescription}
                </p>
              </div>
            </div>
          </div>
          <div className="p-5 sm:p-8">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-slate-300">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 2a7 7 0 0 0 0 20 9 9 0 0 0 0-20Z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <label
                      htmlFor="settings-theme"
                      className="block text-sm font-semibold text-white"
                    >
                      {translations.theme}
                    </label>
                    <p className="mt-1 max-w-md text-sm leading-5 text-slate-400">
                      {t('settings.themeDescription')}
                    </p>
                  </div>
                </div>
                <div className="w-full sm:max-w-xs">
                  <div className="relative">
                    <select
                      id="settings-theme"
                      value={theme}
                      disabled={preferencesSaving || isChangingLanguage}
                      onChange={(event) =>
                        void handlePreferencesChange(
                          event.target.value as Theme,
                        )
                      }
                      className="min-h-12 w-full appearance-none rounded-xl border border-slate-700/90 bg-slate-900 px-4 py-3 pr-11 text-sm font-medium text-white outline-none transition-colors hover:border-slate-600 focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="system">{translations.system}</option>
                      <option value="dark">{translations.dark}</option>
                      <option value="midnight">{translations.midnight}</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m7 10 5 5 5-5" />
                      </svg>
                    </div>
                  </div>
                  <div className="mt-3 flex min-h-5 items-center justify-end">
                    {preferencesSaving ? (
                      <span
                        role="status"
                        className="inline-flex items-center gap-2 text-xs text-slate-400"
                      >
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400" />
                        {t('settings.savingPreferences')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="m5 12 4 4L19 6" />
                        </svg>
                        {t('settings.changesAutoSave')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-slate-300">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <label
                      htmlFor="settings-language"
                      className="block text-sm font-semibold text-white"
                    >
                      {t('settings.language')}
                    </label>
                    <p className="mt-1 max-w-md text-sm leading-5 text-slate-400">
                      {t('settings.languageDescription')}
                    </p>
                  </div>
                </div>
                <div className="w-full sm:max-w-xs">
                  <div className="relative">
                    <select
                      id="settings-language"
                      value={currentLanguage}
                      disabled={isChangingLanguage || preferencesSaving}
                      onChange={(event) =>
                        void handleLanguageChange(
                          event.target.value as AppLanguage,
                        )
                      }
                      className="min-h-12 w-full appearance-none rounded-xl border border-slate-700/90 bg-slate-900 px-4 py-3 pr-11 text-sm font-medium text-white outline-none transition-colors hover:border-slate-600 focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="en">{t('common.english')}</option>
                      <option value="de">{t('common.german')}</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m7 10 5 5 5-5" />
                      </svg>
                    </div>
                  </div>
                  <div className="mt-3 flex min-h-5 items-center justify-end">
                    {isChangingLanguage ? (
                      <span
                        role="status"
                        className="inline-flex items-center gap-2 text-xs text-slate-400"
                      >
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400" />
                        {t('common.loading')}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {t('settings.languageSaved', {
                          defaultValue:
                            'Language preference is saved on this device.',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
      {activeTab === 'notifications' && (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 sm:p-8">
          <div className="max-w-3xl">
            <h2 className="text-xl font-semibold text-white">
              {translations.notifications}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {t('settings.notificationsDescription')}
            </p>
            <div
              role="status"
              className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"
            >
              {t('settings.notificationsTemporarilyUnavailable')}
            </div>
            <div className="mt-7 divide-y divide-slate-800">
              {[
                {
                  label: translations.transactionCompleted,
                  checked: notifyTransactionCompleted,
                  onChange: (value: boolean) =>
                    void handleNotificationsChange(
                      value,
                      notifyMoneyReceived,
                      notifyTransactionFailed,
                    ),
                },
                {
                  label: translations.moneyReceived,
                  checked: notifyMoneyReceived,
                  onChange: (value: boolean) =>
                    void handleNotificationsChange(
                      notifyTransactionCompleted,
                      value,
                      notifyTransactionFailed,
                    ),
                },
                {
                  label: translations.transactionFailed,
                  checked: notifyTransactionFailed,
                  onChange: (value: boolean) =>
                    void handleNotificationsChange(
                      notifyTransactionCompleted,
                      notifyMoneyReceived,
                      value,
                    ),
                },
              ].map((notification) => (
                <label
                  key={notification.label}
                  className="flex min-h-20 cursor-pointer items-center justify-between gap-4 py-4"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-200">
                      {notification.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {t('settings.notificationHelp')}
                    </span>
                  </span>
                  <span className="relative shrink-0">
                    <input
                      type="checkbox"
                      checked={notification.checked}
                      disabled={!NOTIFICATIONS_ENABLED || notificationsSaving}
                      onChange={(event) =>
                        notification.onChange(event.target.checked)
                      }
                      className="peer sr-only"
                    />
                    <span className="block h-7 w-12 rounded-full bg-slate-700 transition peer-checked:bg-blue-500 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400/50" />
                    <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-sm leading-6 text-slate-500">
                {t('settings.securityNotificationsLocked')}
              </p>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
export default SettingsPage;
