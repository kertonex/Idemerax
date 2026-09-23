export type ApiValidationError = {
  type: string;
  loc: string[];
  msg: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
};

export type ApiErrorResponse = {
  detail?: string | ApiValidationError[];
  message?: string;
};
