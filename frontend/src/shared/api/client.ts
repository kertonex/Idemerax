import type { ApiErrorResponse } from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_URL;
const DEFAULT_HEADERS: HeadersInit = {
  Accept: 'application/json',
};

type ApiRequestOptions = Omit<RequestInit, 'body' | 'signal'> & {
  body?: unknown;
  signal?: AbortSignal;
  /** Optional per-request timeout. Omitted requests use the browser/default behavior. */
  timeoutMs?: number;
};

/** An API failure with context for safe request-retry decisions. */
export class ApiClientError extends Error {
  readonly status: number | null;
  readonly outcomeUnknown: boolean;

  constructor(message: string, status: number | null = null, outcomeUnknown = false) {
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

  // Compose caller cancellation with an optional timeout without changing the
  // caller's signal. The timeout is local to this request and always cleaned up.
  const controller = new AbortController();
  let timedOut = false;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) onCallerAbort();
  else callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timeoutId =
    timeoutMs != null && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,
      credentials: 'include',
      headers,
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    // A mutation may have reached the server before the connection failed or timed out.
    throw new ApiClientError(
      timedOut ? 'API request timed out' : 'Unable to connect to API',
      null,
      true,
    );
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }

  if (!response.ok) {
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
    throw new ApiClientError(message, response.status, outcomeUnknown);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
