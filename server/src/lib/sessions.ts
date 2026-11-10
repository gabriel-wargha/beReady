import { createHash, randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sessions, users, type UserRow } from '../db/schema';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEW_WHEN_LEFT_MS = 15 * 24 * 60 * 60 * 1000; // extend once half the time is used

/** The cookie holds the token. The database holds only this hash of it. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export async function createSession(db: Db, userId: string, now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, createdAt: now });
  return { token, expiresAt };
}

/**
 * Looks up the session for a cookie token.
 * Returns the user, plus a new expiry when the session was renewed.
 */
export async function validateSession(
  db: Db,
  token: string,
  now = new Date(),
): Promise<{ user: UserRow; renewedUntil?: Date } | null> {
  const id = hashToken(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1);
  if (!row) return null;

  if (row.session.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  if (row.session.expiresAt.getTime() - now.getTime() < RENEW_WHEN_LEFT_MS) {
    const renewedUntil = new Date(now.getTime() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, id));
    return { user: row.user, renewedUntil };
  }
  return { user: row.user };
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteUserSessions(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteExpiredSessions(db: Db, now = new Date()): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
}
