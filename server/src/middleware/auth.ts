import type { Request, RequestHandler, Response } from 'express';
import { parseCookie, stringifySetCookie } from 'cookie';
import type { Db } from '../db/client';
import { notAuthenticated } from '../lib/problem';
import { SESSION_COOKIE, validateSession } from '../lib/sessions';

export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookie(header)[SESSION_COOKIE];
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date, secure: boolean) {
  res.append(
    'Set-Cookie',
    stringifySetCookie({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true, // JavaScript in the page cannot read it
      secure, // HTTPS only in production
      sameSite: 'lax', // not sent on cross-site POSTs
      path: '/',
      expires: expiresAt,
    }),
  );
}

export function clearSessionCookie(res: Response, secure: boolean) {
  res.append(
    'Set-Cookie',
    stringifySetCookie({
      name: SESSION_COOKIE,
      value: '',
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      expires: new Date(0),
    }),
  );
}

/** Puts the logged-in user on req.user, or answers 401. */
export function requireAuth(db: Db, secureCookies: boolean): RequestHandler {
  return async (req, res, next) => {
    const token = readSessionToken(req);
    if (!token) return next(notAuthenticated());
    const result = await validateSession(db, token);
    if (!result) {
      clearSessionCookie(res, secureCookies);
      return next(notAuthenticated());
    }
    if (result.renewedUntil) setSessionCookie(res, token, result.renewedUntil, secureCookies);
    req.user = result.user;
    req.sessionToken = token;
    next();
  };
}
