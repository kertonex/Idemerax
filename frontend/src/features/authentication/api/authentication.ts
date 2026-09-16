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

interface RegisterRequest {
  /** User email address. */
  email: string;

  /** User password. */
  password: string;
}

interface RegisterResponse {
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

/**
 * Register a new user through the backend authentication API.
 *
 * @param credentials - User email and password.
 * @returns The access token returned by the authentication API.
 */
export function register(
  credentials: RegisterRequest,
): Promise<RegisterResponse> {
  return apiClient<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: credentials,
  });
}