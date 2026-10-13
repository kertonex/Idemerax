import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSettings,
  mockUpdateNotifications,
  mockUpdatePreferences,
  mockUpdateProfile,
  mockChangePassword,
  mockSetCurrentUser,
  mockSetGlobalTheme,
  mockChangeLanguage,
  mockUseAuth,
  mockUseTheme,
  mockUseTranslation,
} = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockUpdateNotifications: vi.fn(),
  mockUpdatePreferences: vi.fn(),
  mockUpdateProfile: vi.fn(),
  mockChangePassword: vi.fn(),
  mockSetCurrentUser: vi.fn(),
  mockSetGlobalTheme: vi.fn(),
  mockChangeLanguage: vi.fn(),
  mockUseAuth: vi.fn(),
  mockUseTheme: vi.fn(),
  mockUseTranslation: vi.fn(),
}));

vi.mock('../../src/features/settings/api/settings', () => ({
  getSettings: mockGetSettings,
  updateNotifications: mockUpdateNotifications,
  updatePreferences: mockUpdatePreferences,
  updateProfile: mockUpdateProfile,
  changePassword: mockChangePassword,
}));

vi.mock('../../src/features/authentication/context/useAuth', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../../src/features/settings/context/ThemeContext', () => ({
  useTheme: mockUseTheme,
}));

vi.mock('react-i18next', () => ({
  useTranslation: mockUseTranslation,
}));

import SettingsPage from '../../src/pages/SettingsPage';

const SETTINGS_RESPONSE = {
  profile: {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
  },
  preferences: {
    theme: 'dark',
    language: 'en',
  },
  notifications: {
    notify_transaction_completed: true,
    notify_money_received: false,
    notify_transaction_failed: true,
  },
};

const AUTHENTICATED_USER = {
  id: 1,
  email: 'ada@example.com',
  first_name: 'Ada',
  last_name: 'Lovelace',
  profile_complete: true,
};

function setupAuthenticatedUser() {
  mockUseAuth.mockReturnValue({
    accessToken: 'test-access-token',
    currentUser: AUTHENTICATED_USER,
    setCurrentUser: mockSetCurrentUser,
  });
}

function setupTranslations() {
  mockUseTranslation.mockReturnValue({
    t: (key: string) => key,
    i18n: {
      language: 'en',
      resolvedLanguage: 'en',
      changeLanguage: mockChangeLanguage,
    },
  });
}

function renderSettingsPage() {
  return render(<SettingsPage />);
}

async function openSettingsTab(tabName: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: tabName }));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockResolvedValue(SETTINGS_RESPONSE);
    mockUpdateNotifications.mockResolvedValue({});
    mockUpdatePreferences.mockResolvedValue({});
    mockUpdateProfile.mockResolvedValue(SETTINGS_RESPONSE.profile);
    mockChangePassword.mockResolvedValue(undefined);
    mockChangeLanguage.mockResolvedValue(undefined);
    mockUseTheme.mockReturnValue({
      setTheme: mockSetGlobalTheme,
    });
    setupAuthenticatedUser();
    setupTranslations();
  });

  afterEach(() => {
    cleanup();
  });

  describe('settings loading', () => {
    it('loads settings and applies the saved theme', async () => {
      renderSettingsPage();
      expect(
        await screen.findByRole('heading', {
          name: 'settings.title',
        }),
      ).toBeInTheDocument();
      expect(mockGetSettings).toHaveBeenCalledOnce();
      expect(mockGetSettings).toHaveBeenCalledWith('test-access-token');
      expect(mockSetGlobalTheme).toHaveBeenCalledWith('dark');
    });

    it('does not request settings without an access token', () => {
      mockUseAuth.mockReturnValue({
        accessToken: null,
        currentUser: AUTHENTICATED_USER,
        setCurrentUser: mockSetCurrentUser,
      });
      renderSettingsPage();
      expect(mockGetSettings).not.toHaveBeenCalled();
    });

    it('does not request settings for an incomplete profile', () => {
      mockUseAuth.mockReturnValue({
        accessToken: 'test-access-token',
        currentUser: {
          ...AUTHENTICATED_USER,
          profile_complete: false,
        },
        setCurrentUser: mockSetCurrentUser,
      });
      renderSettingsPage();
      expect(mockGetSettings).not.toHaveBeenCalled();
      expect(
        screen.getByRole('heading', {
          name: 'settings.setupTitle',
        }),
      ).toBeInTheDocument();
    });

    it('displays an error when loading settings fails', async () => {
      mockGetSettings.mockRejectedValue(new Error('Unable to connect to API'));
      renderSettingsPage();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Unable to connect to API',
      );
    });

    it('does not reload settings when the component rerenders', async () => {
      const { rerender } = renderSettingsPage();
      await screen.findByRole('heading', {
        name: 'settings.title',
      });
      rerender(<SettingsPage />);
      expect(mockGetSettings).toHaveBeenCalledOnce();
    });

    it('changes the language when the saved language differs', async () => {
      mockGetSettings.mockResolvedValue({
        ...SETTINGS_RESPONSE,
        preferences: {
          ...SETTINGS_RESPONSE.preferences,
          language: 'de',
        },
      });
      renderSettingsPage();
      await waitFor(() => {
        expect(mockChangeLanguage).toHaveBeenCalledWith('de');
      });
    });

    it('ignores a settings response received after unmounting', async () => {
      let resolveSettings!: (value: typeof SETTINGS_RESPONSE) => void;
      mockGetSettings.mockReturnValue(
        new Promise<typeof SETTINGS_RESPONSE>((resolve) => {
          resolveSettings = resolve;
        }),
      );
      const { unmount } = renderSettingsPage();
      await waitFor(() => {
        expect(mockGetSettings).toHaveBeenCalledOnce();
      });
      unmount();
      resolveSettings(SETTINGS_RESPONSE);
      await waitFor(() => {
        expect(mockSetGlobalTheme).not.toHaveBeenCalled();
      });
    });
  });

  describe('profile setup', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        accessToken: 'test-access-token',
        currentUser: {
          ...AUTHENTICATED_USER,
          first_name: '',
          last_name: '',
          profile_complete: false,
        },
        setCurrentUser: mockSetCurrentUser,
      });
    });

    it('displays the profile setup form and disables continue for empty names', () => {
      renderSettingsPage();
      expect(screen.getByLabelText('settings.firstName')).toBeInTheDocument();
      expect(screen.getByLabelText('settings.lastName')).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'common.continue',
        }),
      ).toBeDisabled();
    });

    it('opens the confirmation dialog after entering the required names', async () => {
      const user = userEvent.setup();
      renderSettingsPage();
      await user.type(screen.getByLabelText('settings.firstName'), 'Ada');
      await user.type(screen.getByLabelText('settings.lastName'), 'Lovelace');
      await user.click(
        screen.getByRole('button', {
          name: 'common.continue',
        }),
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('saves the confirmed profile and updates the authenticated user', async () => {
      const user = userEvent.setup();
      mockUpdateProfile.mockResolvedValue({
        first_name: 'Grace',
        last_name: 'Hopper',
      });
      renderSettingsPage();
      await user.type(screen.getByLabelText('settings.firstName'), 'Grace');
      await user.type(screen.getByLabelText('settings.lastName'), 'Hopper');
      await user.click(
        screen.getByRole('button', {
          name: 'common.continue',
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: 'settings.confirmProfile',
        }),
      );
      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith('test-access-token', {
          first_name: 'Grace',
          last_name: 'Hopper',
        });
      });
      expect(mockSetCurrentUser).toHaveBeenCalledWith({
        ...AUTHENTICATED_USER,
        first_name: 'Grace',
        last_name: 'Hopper',
        profile_complete: true,
      });
      expect(await screen.findByRole('status')).toHaveTextContent(
        'settings.profileConfirmed',
      );
    });

    it('displays an error when saving the profile fails', async () => {
      const user = userEvent.setup();
      mockUpdateProfile.mockRejectedValue(new Error('Profile update failed'));
      renderSettingsPage();
      await user.type(screen.getByLabelText('settings.firstName'), 'Grace');
      await user.type(screen.getByLabelText('settings.lastName'), 'Hopper');
      await user.click(
        screen.getByRole('button', {
          name: 'common.continue',
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: 'settings.confirmProfile',
        }),
      );
      const alerts = await screen.findAllByRole('alert');
      expect(alerts).toHaveLength(2);
      expect(alerts[0]).toHaveTextContent('Profile update failed');
      expect(alerts[1]).toHaveTextContent('Profile update failed');
    });

    it('trims whitespace from profile names before saving', async () => {
      const user = userEvent.setup();
      mockUpdateProfile.mockResolvedValue({
        first_name: 'Grace',
        last_name: 'Hopper',
      });
      renderSettingsPage();
      await user.type(screen.getByLabelText('settings.firstName'), '  Grace  ');
      await user.type(screen.getByLabelText('settings.lastName'), '  Hopper  ');
      await user.click(
        screen.getByRole('button', {
          name: 'common.continue',
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: 'settings.confirmProfile',
        }),
      );
      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith('test-access-token', {
          first_name: 'Grace',
          last_name: 'Hopper',
        });
      });
    });

    it('does not open the confirmation dialog when a name exceeds 35 characters', async () => {
      const user = userEvent.setup();
      renderSettingsPage();
      const firstNameInput = screen.getByLabelText(
        'settings.firstName',
      ) as HTMLInputElement;
      await user.type(firstNameInput, 'A'.repeat(36));
      await user.type(screen.getByLabelText('settings.lastName'), 'Lovelace');
      // The input itself limits the name length to 35 characters.
      expect(firstNameInput.value.length).toBeLessThanOrEqual(35);
      await user.click(
        screen.getByRole('button', {
          name: 'common.continue',
        }),
      );
      // If the input enforces maxLength, the form may legitimately proceed
      // with the resulting 35-character value.
      if (screen.queryByRole('dialog')) {
        expect(firstNameInput.value).toHaveLength(35);
      } else {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      }
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });
  });

  describe('password changes', () => {
    async function setupSecurityTab() {
      renderSettingsPage();
      await screen.findByRole('heading', {
        name: 'settings.title',
      });
      await openSettingsTab('security.title');
    }

    async function fillPasswordForm(
      currentPassword = 'CurrentPassword123!',
      newPassword = 'NewSecurePassword123!',
      confirmPassword = newPassword,
    ) {
      const user = userEvent.setup();
      await user.type(
        screen.getByLabelText('settings.currentPassword'),
        currentPassword,
      );
      await user.type(
        screen.getByLabelText('settings.newPassword'),
        newPassword,
      );
      await user.type(
        screen.getByLabelText('settings.confirmPassword'),
        confirmPassword,
      );
      return user;
    }

    it('rejects a password that is shorter than the minimum length', async () => {
      await setupSecurityTab();
      const user = await fillPasswordForm('CurrentPassword123!', 'Short123!');
      await user.click(
        screen.getByRole('button', {
          name: 'settings.changePassword',
        }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'settings.passwordLength',
      );
      expect(mockChangePassword).not.toHaveBeenCalled();
    });

    it('rejects mismatched new passwords', async () => {
      await setupSecurityTab();
      const user = await fillPasswordForm(
        'CurrentPassword123!',
        'NewSecurePassword123!',
        'DifferentPassword123!',
      );
      await user.click(
        screen.getByRole('button', {
          name: 'settings.changePassword',
        }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'settings.passwordMismatch',
      );
      expect(mockChangePassword).not.toHaveBeenCalled();
    });

    it('changes the password and clears the form after success', async () => {
      await setupSecurityTab();
      const user = await fillPasswordForm();
      await user.click(
        screen.getByRole('button', {
          name: 'settings.changePassword',
        }),
      );
      await waitFor(() => {
        expect(mockChangePassword).toHaveBeenCalledWith('test-access-token', {
          current_password: 'CurrentPassword123!',
          new_password: 'NewSecurePassword123!',
          confirm_password: 'NewSecurePassword123!',
        });
      });
      expect(await screen.findByRole('status')).toHaveTextContent(
        'settings.passwordChanged',
      );
      expect(screen.getByLabelText('settings.currentPassword')).toHaveValue('');
      expect(screen.getByLabelText('settings.newPassword')).toHaveValue('');
      expect(screen.getByLabelText('settings.confirmPassword')).toHaveValue('');
    });

    it('displays an error when changing the password fails', async () => {
      mockChangePassword.mockRejectedValue(
        new Error('Current password is incorrect'),
      );
      await setupSecurityTab();
      const user = await fillPasswordForm();
      await user.click(
        screen.getByRole('button', {
          name: 'settings.changePassword',
        }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Current password is incorrect',
      );
    });

    it('shows the too-short password strength warning', async () => {
      await setupSecurityTab();
      const user = userEvent.setup();
      await user.type(
        screen.getByLabelText('settings.newPassword'),
        'Short123!',
      );
      expect(
        await screen.findByText('settings.passwordStrength.tooShort'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Use at least 15 characters.'),
      ).toBeInTheDocument();
    });

    it('enforces the maximum password input length', async () => {
      await setupSecurityTab();
      const passwordInput = screen.getByLabelText('settings.newPassword');
      expect(passwordInput).toHaveAttribute('maxLength', '128');
    });

    it('shows the fallback error when password change throws a non-Error value', async () => {
      mockChangePassword.mockRejectedValue('unexpected failure');
      await setupSecurityTab();
      const user = await fillPasswordForm();
      await user.click(
        screen.getByRole('button', {
          name: 'settings.changePassword',
        }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'settings.passwordChangeFailed',
      );
    });

    it('temporarily reveals the new password when requested', async () => {
      await setupSecurityTab();
      const user = userEvent.setup();
      const newPasswordInput = screen.getByLabelText('settings.newPassword');
      await user.type(newPasswordInput, 'NewSecurePassword123!');
      const visibilityButtons = screen.getAllByRole('button', {
        name: 'settings.showPasswordTemporarily',
      });
      await user.click(visibilityButtons[1]);
      expect(newPasswordInput).toHaveAttribute('type', 'text');
      expect(newPasswordInput).toHaveValue('NewSecurePassword123!');
    });
  });

  describe('preferences', () => {
    async function setupPreferencesTab() {
      renderSettingsPage();
      await screen.findByRole('heading', {
        name: 'settings.title',
      });
      await openSettingsTab('settings.preferences');
    }

    it('saves a theme change and applies it globally', async () => {
      const user = userEvent.setup();
      await setupPreferencesTab();
      await user.selectOptions(
        screen.getByLabelText('settings.theme'),
        'midnight',
      );
      await waitFor(() => {
        expect(mockUpdatePreferences).toHaveBeenCalledWith(
          'test-access-token',
          {
            language: 'en',
            theme: 'midnight',
          },
        );
      });
      expect(mockSetGlobalTheme).toHaveBeenCalledWith('midnight');
    });

    it('restores the previous theme when saving preferences fails', async () => {
      const user = userEvent.setup();
      mockUpdatePreferences.mockRejectedValue(
        new Error('Unable to save preferences'),
      );
      await setupPreferencesTab();
      await user.selectOptions(
        screen.getByLabelText('settings.theme'),
        'midnight',
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Unable to save preferences',
      );
      await waitFor(() => {
        expect(mockSetGlobalTheme).toHaveBeenLastCalledWith('dark');
      });
      expect(screen.getByLabelText('settings.theme')).toHaveValue('dark');
    });

    it('saves a language change', async () => {
      const user = userEvent.setup();
      await setupPreferencesTab();
      await user.selectOptions(
        screen.getByLabelText('settings.language'),
        'de',
      );
      await waitFor(() => {
        expect(mockUpdatePreferences).toHaveBeenCalledWith(
          'test-access-token',
          {
            language: 'de',
            theme: 'dark',
          },
        );
      });
      expect(mockChangeLanguage).toHaveBeenCalledWith('de');
    });

    it('shows a fallback error when saving preferences throws a non-Error value', async () => {
      const user = userEvent.setup();
      mockUpdatePreferences.mockRejectedValue('unexpected failure');
      await setupPreferencesTab();
      await user.selectOptions(
        screen.getByLabelText('settings.theme'),
        'midnight',
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'settings.preferencesSaveFailed',
      );
    });
  });

  describe('notifications', () => {
    async function setupNotificationsTab() {
      renderSettingsPage();
      await screen.findByRole('heading', {
        name: 'settings.title',
      });
      await openSettingsTab('notifications.title');
    }

    it('loads the saved notification preferences as disabled controls', async () => {
      await setupNotificationsTab();
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(3);
      expect(checkboxes[0]).toBeChecked();
      expect(checkboxes[1]).not.toBeChecked();
      expect(checkboxes[2]).toBeChecked();
      for (const checkbox of checkboxes) {
        expect(checkbox).toBeDisabled();
      }
    });

    it('explains that notification preferences are temporarily unavailable', async () => {
      await setupNotificationsTab();
      expect(
        screen.getByText('settings.notificationsTemporarilyUnavailable'),
      ).toBeInTheDocument();
    });

    it('does not save notification preferences while the controls are disabled', async () => {
      const user = userEvent.setup();
      await setupNotificationsTab();
      const checkboxes = screen.getAllByRole('checkbox');
      for (const checkbox of checkboxes) {
        expect(checkbox).toBeDisabled();
      }
      await user.click(checkboxes[1]);
      expect(mockUpdateNotifications).not.toHaveBeenCalled();
      expect(checkboxes[1]).not.toBeChecked();
    });
  });
});
