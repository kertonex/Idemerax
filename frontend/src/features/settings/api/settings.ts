import { apiClient } from '../../../shared/api/client';

export type Language = 'en' | 'de';

export type Theme = 'system' | 'dark' | 'midnight';

export interface ProfileSettings {
  first_name: string | null;
  last_name: string | null;
  email: string;
}

export interface PreferencesSettings {
  language: Language;
  theme: Theme;
}

export interface NotificationSettings {
  notify_transaction_completed: boolean;
  notify_money_received: boolean;
  notify_transaction_failed: boolean;
}

export interface SettingsResponse {
  profile: ProfileSettings;
  preferences: PreferencesSettings;
  notifications: NotificationSettings;
}

export interface ProfileSettingsUpdate {
  first_name: string;
  last_name: string;
}

export interface PreferencesSettingsUpdate {
  language: Language;
  theme: Theme;
}

export interface NotificationSettingsUpdate {
  notify_transaction_completed: boolean;
  notify_money_received: boolean;
  notify_transaction_failed: boolean;
}

export interface PasswordChangeRequest {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export function getSettings(accessToken: string): Promise<SettingsResponse> {
  return apiClient<SettingsResponse>('/settings', {
    headers: authHeaders(accessToken),
  });
}

export function updateProfile(
  accessToken: string,
  data: ProfileSettingsUpdate,
): Promise<ProfileSettings> {
  return apiClient<ProfileSettings>('/settings/profile', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: data,
  });
}

export function updatePreferences(
  accessToken: string,
  data: PreferencesSettingsUpdate,
): Promise<PreferencesSettings> {
  return apiClient<PreferencesSettings>('/settings/preferences', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: data,
  });
}

export function updateNotifications(
  accessToken: string,
  data: NotificationSettingsUpdate,
): Promise<NotificationSettings> {
  return apiClient<NotificationSettings>('/settings/notifications', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: data,
  });
}

export function changePassword(
  accessToken: string,
  data: PasswordChangeRequest,
): Promise<void> {
  return apiClient<void>('/settings/password', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: data,
  });
}
