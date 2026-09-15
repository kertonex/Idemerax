import { apiClient } from '../../../shared/api/client';

interface LoginRequest {
  /** User email address. */
  email: string;

  /** User password. */
  password: string;
}

interface LoginResponse {
  /** Signed JWT access token returned by the API. */
  access_token: string;

  /** Authentication scheme used for the access token. */
  token_type: string;
}

/**
 * Authenticate a user through the backend authentication API.
 *
 * @param credentials - User email and password.
 * @returns The access token returned by the authentication API.
 */
export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return apiClient<LoginResponse>('/auth/login', {
    method: 'POST',
    body: credentials,
  });
}
