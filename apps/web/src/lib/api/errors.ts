export type ApiErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'rate_limit_error'
  | 'idempotency_error'
  | 'api_error';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly type: ApiErrorType,
    readonly code: string,
    message: string,
    readonly param?: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export function errorBody(e: ApiError) {
  return { error: { type: e.type, code: e.code, message: e.message, ...(e.param ? { param: e.param } : {}) } };
}
