import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ProblemError, notFound } from '../lib/problem';

/** Any /api path that no route handled. */
export const apiNotFound: RequestHandler = (req, _res, next) => {
  next(notFound(`No endpoint at ${req.method} ${req.originalUrl.split('?')[0]}`));
};

/**
 * The single place where errors become responses.
 * Every error leaves the API as application/problem+json (RFC 9457).
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, req, res, _next) => {
    let problem: ProblemError;
    if (err instanceof ProblemError) {
      problem = err;
    } else if (err?.type === 'entity.parse.failed') {
      problem = new ProblemError(400, 'validation_failed', 'Body is not valid JSON.');
    } else if (err?.type === 'entity.too.large') {
      problem = new ProblemError(413, 'file_too_large', 'Request body is too large.');
    } else {
      // Unknown error: log the details, tell the client nothing internal.
      logger.error({ err, requestId: req.requestId }, 'unhandled error');
      problem = new ProblemError(500, 'internal_error');
    }
    for (const [k, v] of Object.entries(problem.headers ?? {})) res.setHeader(k, v);
    res
      .status(problem.status)
      .type('application/problem+json')
      .send(JSON.stringify(problem.toJSON(req.requestId)));
  };
}
