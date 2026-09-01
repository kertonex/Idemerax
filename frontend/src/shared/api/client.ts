import type { ApiErrorResponse } from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const DEFAULT_HEADERS: HeadersInit = {
  Accept: 'application/json',
};

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

export async function apiClient<T>(
  path: string,
  options?: ApiRequestOptions,
): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('API base URL is not configured');
  }

  const { body, headers: requestHeaders, ...requestOptions } = options ?? {};

  const headers = new Headers(DEFAULT_HEADERS);

  if (requestHeaders) {
    new Headers(requestHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error('Unable to connect to API');
  }

  if (!response.ok) {
    let errorData: ApiErrorResponse | undefined;

    try {
      errorData = (await response.json()) as ApiErrorResponse;
    } catch {
      errorData = undefined;
    }

    throw new Error(
      errorData?.detail ??
        errorData?.message ??
        `API request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}
