import { sql } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createDb } from '../src/db/client';

export type TestContext = Awaited<ReturnType<typeof makeApp>>;

// Starting the embedded Postgres takes about a second, so each test file starts it once.
let shared: ReturnType<typeof createDb> | undefined;

/**
 * A fresh app on an empty database, with the real migrations applied.
 * The database engine is reused within a test file; its tables are emptied before every test.
 * The app is rebuilt every time, so rate-limit counters start from zero.
 */
export async function makeApp() {
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  const { db } = await (shared ??= createDb()); // no options = in-memory Postgres
  await db.execute(sql`truncate table users cascade`);
  const app = createApp({ db, env });
  return { app, db };
}

export const validUser = {
  email: 'alex.rivera@example.com',
  password: 'correct-horse-battery',
  name: 'Alex Rivera',
};

/** Signs up and returns the session cookie, ready to pass to .set('Cookie', ...). */
export async function signUp(app: TestContext['app'], user = validUser) {
  const res = await request(app).post('/api/v1/auth/signup').send(user);
  const cookie = cookieFrom(res);
  return { res, cookie };
}

export function cookieFrom(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const first = header?.[0];
  if (!first) throw new Error('No Set-Cookie header on response');
  return first.split(';')[0]!; // "sid=<token>"
}
