import { Router } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { eq } from 'drizzle-orm';
import {
  loginBodySchema,
  signupBodySchema,
  type LoginBody,
  type SignupBody,
} from '@beready/shared';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { newId } from '../lib/ids';
import { getDummyHash, hashPassword, verifyPassword } from '../lib/password';
import { ProblemError } from '../lib/problem';
import { createSession, deleteSession } from '../lib/sessions';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { toUser } from './serialize';

const tooManyRequests = (retryAfterSeconds: number) =>
  new ProblemError(429, 'rate_limited', 'Too many attempts. Try again in a minute.', undefined, {
    'Retry-After': String(retryAfterSeconds),
  });

export function authRoutes(db: Db, secureCookies: boolean): Router {
  const router = Router();

  // 5 login tries per minute for each IP + email pair. Slows down password guessing.
  const loginLimiter = rateLimit({
    windowMs: 60_000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) =>
      `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.email ?? '').toLowerCase()}`,
    handler: (_req, _res, next) => next(tooManyRequests(60)),
  });

  // 10 signups per hour per IP. Slows down mass account creation.
  const signupLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(tooManyRequests(3600)),
  });

  router.post('/auth/signup', signupLimiter, validateBody(signupBodySchema), async (req, res) => {
    const body = req.body as SignupBody;
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);
    if (existing) {
      throw new ProblemError(409, 'email_taken', 'An account with this email already exists.', [
        { path: 'email', message: 'This email is already registered' },
      ]);
    }
    const id = newId('usr');
    await db.insert(users).values({
      id,
      email: body.email,
      name: body.name,
      passwordHash: await hashPassword(body.password),
      createdAt: new Date(),
    });
    const session = await createSession(db, id);
    setSessionCookie(res, session.token, session.expiresAt, secureCookies);
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    res.status(201).location('/api/v1/me').json(toUser(user!));
  });

  router.post('/auth/login', validateBody(loginBodySchema), loginLimiter, async (req, res) => {
    const body = req.body as LoginBody;
    const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    // Always verify something, so unknown emails take as long as wrong passwords.
    const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), body.password);
    if (!user || !ok) {
      // One message for both cases: never reveal whether the email exists.
      throw new ProblemError(401, 'invalid_credentials', 'Email or password is wrong.');
    }
    const session = await createSession(db, user.id);
    setSessionCookie(res, session.token, session.expiresAt, secureCookies);
    res.json(toUser(user));
  });

  router.post('/auth/logout', async (req, res) => {
    const token = readSessionToken(req);
    if (token) await deleteSession(db, token);
    clearSessionCookie(res, secureCookies);
    res.status(204).end();
  });

  return router;
}
