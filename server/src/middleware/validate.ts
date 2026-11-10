import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { ProblemError } from '../lib/problem';

export function zodToProblem(error: z.ZodError): ProblemError {
  const errors = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  const n = errors.length;
  return new ProblemError(
    400,
    'validation_failed',
    `${n} field${n === 1 ? ' is' : 's are'} invalid.`,
    errors,
  );
}

/**
 * Checks req.body against a shared Zod schema and replaces it with the parsed value
 * (trimmed, lowercased and so on), so route handlers only ever see clean data.
 */
export function validateBody<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return next(zodToProblem(parsed.error));
    req.body = parsed.data;
    next();
  };
}
