import type { ErrorCode, Problem } from '@beready/shared';

const titles: Partial<Record<ErrorCode, string>> = {
  validation_failed: 'Request is invalid',
  not_authenticated: 'You are not logged in',
  invalid_credentials: 'Email or password is wrong',
  bad_origin: 'Request came from another site',
  not_found: 'Not found',
  email_taken: 'Email is already registered',
  rate_limited: 'Too many requests',
  internal_error: 'Something went wrong',
};

/**
 * The one error type routes and services throw.
 * The error middleware turns it into an RFC 9457 problem details response.
 */
export class ProblemError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    public readonly detail?: string,
    public readonly errors?: { path: string; message: string }[],
    public readonly headers?: Record<string, string>,
  ) {
    super(detail ?? code);
  }

  toJSON(requestId?: string): Problem {
    return {
      type: `/errors/${this.code.replaceAll('_', '-')}`,
      title: titles[this.code] ?? this.code,
      status: this.status,
      code: this.code,
      ...(this.detail ? { detail: this.detail } : {}),
      ...(this.errors ? { errors: this.errors } : {}),
      ...(requestId ? { requestId } : {}),
    };
  }
}

export const notAuthenticated = () => new ProblemError(401, 'not_authenticated');
export const notFound = (detail?: string) => new ProblemError(404, 'not_found', detail);
