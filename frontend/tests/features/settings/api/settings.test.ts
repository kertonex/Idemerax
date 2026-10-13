import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PreferencesSettingsUpdate } from '../../../../src/features/settings/api/settings';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: vi.fn(),
}));

vi.mock('../../../../src/shared/api/client', () => ({
  apiClient: mockApiClient,
}));

import {
  changePassword,
  getSettings,
  updateNotifications,
  updatePreferences,
  updateProfile,
} from '../../../../src/features/settings/api/settings';

const accessToken = 'test-access-token';

const profileData = {
  first_name: 'Ada',
  last_name: 'Lovelace',
};

const preferencesData: PreferencesSettingsUpdate = {
  language: 'en',
  theme: 'dark',
};

const notificationData = {
  notify_transaction_completed: true,
  notify_money_received: false,
  notify_transaction_failed: true,
};

const passwordData = {
  current_password: 'CurrentPassword123!',
  new_password: 'NewPassword456!',
  confirm_password: 'NewPassword456!',
};

describe('Settings API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.mockResolvedValue({});
  });

  describe('getSettings', () => {
    it('requests the authenticated user settings', async () => {
      const response = {
        profile: {
          first_name: 'Ada',
          last_name: 'Lovelace',
          email: 'ada@example.com',
        },
        preferences: {
          language: 'en',
          theme: 'dark',
        },
        notifications: notificationData,
      };

      mockApiClient.mockResolvedValue(response);

      await expect(getSettings(accessToken)).resolves.toEqual(response);

      expect(mockApiClient).toHaveBeenCalledWith('/settings', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    });

    it('propagates errors when settings cannot be loaded', async () => {
      mockApiClient.mockRejectedValue(new Error('Unable to load settings'));

      await expect(getSettings(accessToken)).rejects.toThrow(
        'Unable to load settings',
      );
    });
  });

  describe('updateProfile', () => {
    it('updates the profile using PUT', async () => {
      const response = {
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
      };

      mockApiClient.mockResolvedValue(response);

      await expect(updateProfile(accessToken, profileData)).resolves.toEqual(
        response,
      );

      expect(mockApiClient).toHaveBeenCalledWith('/settings/profile', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: profileData,
      });
    });

    it('propagates profile update errors', async () => {
      mockApiClient.mockRejectedValue(new Error('Profile update failed'));

      await expect(updateProfile(accessToken, profileData)).rejects.toThrow(
        'Profile update failed',
      );
    });
  });

  describe('updatePreferences', () => {
    it.each([
      ['en', 'system'],
      ['en', 'dark'],
      ['en', 'midnight'],
      ['de', 'system'],
      ['de', 'dark'],
      ['de', 'midnight'],
    ] as const)('updates language %s and theme %s', async (language, theme) => {
      const data: PreferencesSettingsUpdate = {
        language,
        theme,
      };

      mockApiClient.mockResolvedValue(data);

      await expect(updatePreferences(accessToken, data)).resolves.toEqual(data);

      expect(mockApiClient).toHaveBeenCalledWith('/settings/preferences', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: data,
      });
    });

    it('propagates preference update errors', async () => {
      mockApiClient.mockRejectedValue(new Error('Preference update failed'));

      await expect(
        updatePreferences(accessToken, preferencesData),
      ).rejects.toThrow('Preference update failed');
    });
  });

  describe('updateNotifications', () => {
    it('updates all notification preferences using PUT', async () => {
      mockApiClient.mockResolvedValue(notificationData);

      await expect(
        updateNotifications(accessToken, notificationData),
      ).resolves.toEqual(notificationData);

      expect(mockApiClient).toHaveBeenCalledWith('/settings/notifications', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: notificationData,
      });
    });

    it('propagates notification update errors', async () => {
      mockApiClient.mockRejectedValue(new Error('Notification update failed'));

      await expect(
        updateNotifications(accessToken, notificationData),
      ).rejects.toThrow('Notification update failed');
    });
  });

  describe('changePassword', () => {
    it('sends the password change request using POST', async () => {
      mockApiClient.mockResolvedValue(undefined);

      await expect(
        changePassword(accessToken, passwordData),
      ).resolves.toBeUndefined();

      expect(mockApiClient).toHaveBeenCalledWith('/settings/password', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: passwordData,
      });
    });

    it('propagates password change errors', async () => {
      mockApiClient.mockRejectedValue(new Error('Password change failed'));

      await expect(changePassword(accessToken, passwordData)).rejects.toThrow(
        'Password change failed',
      );
    });
  });
});
