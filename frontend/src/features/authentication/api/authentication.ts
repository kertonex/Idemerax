import { apiClient } from '../../../shared/api/client';

interface LoginRequest {
  /** User email address. */
  email: string;

  /** User password. */
  password: string;
}

interface AuthTokenResponse {
  /** Signed JWT access token returned by the API. */
  access_token: string;

  /** Authentication scheme used for the access token. */
  token_type: string;
}

interface RegisterRequest {
  /** User email address. */
  email: string;

  /** User password. */
  password: string;
}

interface AuthenticatedUser {
  /** User ID. */
  id: number;

  /** User email address. */
  email: string;

  /** User role. */
  role: string;

  /** Whether the user account is active. */
  is_active: boolean;
}

/**
 * Authenticate a user through the backend authentication API.
 *
 * @param credentials - User email and password.
 * @returns The access token returned by the authentication API.
 */
export function login(credentials: LoginRequest): Promise<AuthTokenResponse> {
  return apiClient<AuthTokenResponse>('/auth/login', {
    method: 'POST',
    body: credentials,
  });
}

/**
 * Register a new user through the backend authentication API.
 *
 * @param credentials - User email and password.
 * @returns The access token returned by the authentication API.
 */
export function register(
  credentials: RegisterRequest,
): Promise<AuthTokenResponse> {
  return apiClient<AuthTokenResponse>('/auth/register', {
    method: 'POST',
    body: credentials,
  });
}

/**
 * Get the currently authenticated user through the backend authentication API.
 *
 * @param accessToken - JWT access token used for authentication.
 * @returns The currently authenticated user.
 */
export function getCurrentUser(
  accessToken: string,
): Promise<AuthenticatedUser> {
  return apiClient<AuthenticatedUser>('/auth/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/**
 * Refresh the current access token through the authentication API.
 *
 * The refresh session is sent automatically through the secure HttpOnly
 * refresh token cookie.
 *
 * @returns The new access token returned by the authentication API.
 */
export function refreshAccessToken(): Promise<AuthTokenResponse> {
  return apiClient<AuthTokenResponse>('/auth/refresh', {
    method: 'POST',
  });
}

/**
 * Log out the current user through the authentication API.
 *
 * The backend revokes the refresh session and clears the
 * refresh token cookie.
 */
export function logout(): Promise<void> {
  return apiClient<void>('/auth/logout', {
    method: 'POST',
  });
}
