import { apiClient } from '../../../shared/api/client';

export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
};

export type AuthTokenResponse = {
  access_token: string;
  token_type: string;
};

export type AuthenticatedUser = {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
  profile_complete: boolean;
};

export function login(credentials: LoginRequest): Promise<AuthTokenResponse> {
  return apiClient<AuthTokenResponse>('/auth/login', {
    method: 'POST',
    body: credentials,
  });
}

export function register(
  credentials: RegisterRequest,
): Promise<AuthTokenResponse> {
  return apiClient<AuthTokenResponse>('/auth/register', {
    method: 'POST',
    body: credentials,
  });
}

export function getCurrentUser(
  accessToken: string,
): Promise<AuthenticatedUser> {
  return apiClient<AuthenticatedUser>('/auth/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function refreshAccessToken(): Promise<AuthTokenResponse> {
  return apiClient<AuthTokenResponse>('/auth/refresh', {
    method: 'POST',
  });
}

export function logout(): Promise<void> {
  return apiClient<void>('/auth/logout', {
    method: 'POST',
  });
}
