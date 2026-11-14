import type { ApiErrorResponse } from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_URL;
const DEFAULT_HEADERS: HeadersInit = {
  Accept: 'application/json',
};
const ACCESS_TOKEN_STORAGE_KEY = 'idemerax_access_token';
const AUTH_REFRESH_EXCLUDED_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
]);
const REFRESH_TIMEOUT_MS = 10_000;

type ApiRequestOptions = Omit<RequestInit, 'body' | 'signal'> & {
  body?: unknown;
  signal?: AbortSignal;
  /** Optional per-request timeout. Omitted requests use the browser/default behavior. */
  timeoutMs?: number;
};

interface AuthSessionCallbacks {
  onAccessTokenRefreshed?: (accessToken: string) => void;
  onSessionExpired?: () => void;
}

let authSessionCallbacks: AuthSessionCallbacks = {};
const refreshRequests = new Map<string, Promise<string>>();
const rotatedAccessTokens = new Map<string, string>();
const expiredAccessTokens = new Set<string>();

/** Register the React authentication state callbacks used by automatic renewal. */
export function registerAuthSessionCallbacks(
  callbacks: AuthSessionCallbacks,
): () => void {
  authSessionCallbacks = callbacks;

  return () => {
    if (authSessionCallbacks === callbacks) {
      authSessionCallbacks = {};
    }
  };
}

/** An API failure with context for safe request-retry decisions. */
export class ApiClientError extends Error {
  readonly status: number | null;
  readonly outcomeUnknown: boolean;

  constructor(
    message: string,
    status: number | null = null,
    outcomeUnknown = false,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.outcomeUnknown = outcomeUnknown;
  }
}

function getApiErrorMessage(
  errorData: ApiErrorResponse | undefined,
): string | undefined {
  if (!errorData) {
    return undefined;
  }

  if (typeof errorData.detail === 'string') {
    return errorData.detail;
  }

  if (Array.isArray(errorData.detail) && errorData.detail.length > 0) {
    const validationError = errorData.detail[0];

    if (
      validationError.loc.includes('email') &&
      validationError.type === 'value_error'
    ) {
      return 'Please enter a valid email address.';
    }

    return validationError.msg;
  }

  return errorData.message;
}

async function createApiError(response: Response): Promise<ApiClientError> {
  let errorData: ApiErrorResponse | undefined;
  try {
    errorData = (await response.json()) as ApiErrorResponse;
  } catch {
    errorData = undefined;
  }

  const message =
    getApiErrorMessage(errorData) ??
    `API request failed with status ${response.status}`;
  const outcomeUnknown = response.status >= 500 || response.status === 408;
  return new ApiClientError(message, response.status, outcomeUnknown);
}

function getBearerToken(headers: Headers): string | null {
  const authorization = headers.get('Authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function setBearerToken(headers: Headers, accessToken: string): void {
  headers.set('Authorization', `Bearer ${accessToken}`);
}

function clearAuthenticationSession(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  authSessionCallbacks.onSessionExpired?.();
}

async function requestAccessTokenRefresh(
  previousAccessToken: string,
): Promise<string> {
  const storedAccessToken = sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);

  if (expiredAccessTokens.has(previousAccessToken)) {
    throw new ApiClientError('Authentication session has expired', 401);
  }

  // Another request may already have completed the refresh while this 401 was
  // in flight. Reuse that token instead of rotating the refresh cookie again.
  if (storedAccessToken && storedAccessToken !== previousAccessToken) {
    if (rotatedAccessTokens.get(previousAccessToken) === storedAccessToken) {
      return storedAccessToken;
    }
    throw new ApiClientError('Authentication session changed', 401);
  }

  const existingRequest = refreshRequests.get(previousAccessToken);
  if (existingRequest) {
    return existingRequest;
  }

  const refreshRequest = (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      });
    } catch {
      throw new ApiClientError('Unable to refresh authentication session');
    }

    if (response.status === 401) {
      // Do not clear a newer login if the user changed sessions while this
      // refresh request was in flight.
      if (
        sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) === previousAccessToken
      ) {
        expiredAccessTokens.add(previousAccessToken);
        if (expiredAccessTokens.size > 10) {
          const oldestToken = expiredAccessTokens.values().next().value;
          if (oldestToken) expiredAccessTokens.delete(oldestToken);
        }
        clearAuthenticationSession();
      }
      throw new ApiClientError('Authentication session has expired', 401);
    }

    if (!response.ok) {
      throw await createApiError(response);
    }

    let tokenResponse: { access_token?: string };
    try {
      tokenResponse = (await response.json()) as { access_token?: string };
    } catch {
      throw new ApiClientError('Invalid authentication refresh response');
    }

    if (!tokenResponse.access_token) {
      throw new ApiClientError('Invalid authentication refresh response');
    }

    // Never let a late response from a previous session overwrite a newer
    // login or restore a session after the user has logged out.
    if (
      sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) !== previousAccessToken
    ) {
      throw new ApiClientError('Authentication session changed', 401);
    }

    sessionStorage.setItem(
      ACCESS_TOKEN_STORAGE_KEY,
      tokenResponse.access_token,
    );
    rotatedAccessTokens.set(previousAccessToken, tokenResponse.access_token);
    if (rotatedAccessTokens.size > 10) {
      const oldestToken = rotatedAccessTokens.keys().next().value;
      if (oldestToken) rotatedAccessTokens.delete(oldestToken);
    }
    authSessionCallbacks.onAccessTokenRefreshed?.(tokenResponse.access_token);

    return tokenResponse.access_token;
  })();

  refreshRequests.set(previousAccessToken, refreshRequest);
  try {
    return await refreshRequest;
  } finally {
    if (refreshRequests.get(previousAccessToken) === refreshRequest) {
      refreshRequests.delete(previousAccessToken);
    }
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) {
    onCallerAbort();
  } else {
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  }

  const timeoutId =
    timeoutMs != null && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ApiClientError(
      timedOut ? 'API request timed out' : 'Unable to connect to API',
      null,
      true,
    );
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}

export async function apiClient<T>(
  path: string,
  options?: ApiRequestOptions,
): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiClientError('API base URL is not configured');
  }

  const {
    body,
    headers: requestHeaders,
    signal: callerSignal,
    timeoutMs,
    ...requestOptions
  } = options ?? {};
  const headers = new Headers(DEFAULT_HEADERS);

  if (requestHeaders) {
    new Headers(requestHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;
  const requestInit: RequestInit = {
    ...requestOptions,
    credentials: 'include',
    headers,
    ...(serializedBody !== undefined ? { body: serializedBody } : {}),
  };

  let response = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    requestInit,
    callerSignal,
    timeoutMs,
  );

  const originalAccessToken = getBearerToken(headers);
  if (
    response.status === 401 &&
    originalAccessToken &&
    !AUTH_REFRESH_EXCLUDED_PATHS.has(path)
  ) {
    const refreshedAccessToken =
      await requestAccessTokenRefresh(originalAccessToken);

    const retryHeaders = new Headers(headers);
    setBearerToken(retryHeaders, refreshedAccessToken);

    response = await fetchWithTimeout(
      `${API_BASE_URL}${path}`,
      { ...requestInit, headers: retryHeaders },
      callerSignal,
      timeoutMs,
    );
  }

  if (!response.ok) {
    throw await createApiError(response);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
