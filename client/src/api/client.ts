import type { Problem } from '@beready/shared';

/** Thrown for every non-2xx answer. Carries the server's problem details. */
export class ApiError extends Error {
  constructor(public readonly problem: Problem) {
    super(problem.detail ?? problem.title);
  }
  get status() {
    return this.problem.status;
  }
  /** Field errors as { email: 'Must be a valid email' } for forms. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.problem.errors ?? []) out[e.path] ??= e.message;
    return out;
  }
}

const BASE = '/api/v1';

/** The one function the app uses to call the API. Always same-origin, always with the cookie. */
export async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined && !(body instanceof FormData) ? {'Content-Type': 'application/json'} : {}),
        ...(idempotencyKey ? {'Idempotency-Key': idempotencyKey} : {}),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError({
      type: '/errors/network',
      title: 'Cannot reach the server',
      status: 0,
      code: 'internal_error',
      detail: 'Cannot reach the server. Check that it is running.',
    });
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      data ?? {
        type: 'about:blank',
        title: res.statusText,
        status: res.status,
        code: 'internal_error',
      },
    );
  }
  return data as T;
}
