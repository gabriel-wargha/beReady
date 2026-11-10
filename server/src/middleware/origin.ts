import type { RequestHandler } from 'express';
import { ProblemError } from '../lib/problem';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Blocks cross-site requests that change data (CSRF).
 * Browsers always send an Origin header on cross-site POST, PATCH and DELETE.
 * If it is present, it must be our own address. Tools like curl send no Origin and are allowed,
 * because they also do not carry a victim's cookie.
 */
export function checkOrigin(extraAllowedOrigin?: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return next(new ProblemError(403, 'bad_origin'));
    }
    const sameHost = originHost === req.get('host');
    const allowedExtra =
      extraAllowedOrigin !== undefined && origin === new URL(extraAllowedOrigin).origin;
    if (sameHost || allowedExtra) return next();
    next(new ProblemError(403, 'bad_origin'));
  };
}
