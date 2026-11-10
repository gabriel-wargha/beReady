import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { sessions, users } from '../src/db/schema';
import { hashToken } from '../src/lib/sessions';
import { cookieFrom, makeApp, signUp, validUser, type TestContext } from './helpers';

let ctx: TestContext;
beforeEach(async () => {
  ctx = await makeApp();
});

describe('POST /auth/signup', () => {
  it('creates the account, returns 201 and sets an httpOnly session cookie', async () => {
    const { res } = await signUp(ctx.app);
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe('/api/v1/me');
    expect(res.body).toMatchObject({ email: validUser.email, name: validUser.name, isDemo: false });
    expect(res.body.id).toMatch(/^usr_/);
    expect(res.body).not.toHaveProperty('passwordHash');
    const setCookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(setCookie).toMatch(/^sid=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it('stores the email lowercased and trimmed', async () => {
    const { res } = await signUp(ctx.app, { ...validUser, email: '  Alex.Rivera@Example.com ' });
    expect(res.body.email).toBe('alex.rivera@example.com');
  });

  it('returns 409 email_taken for a duplicate email', async () => {
    await signUp(ctx.app);
    const res = await request(ctx.app).post('/api/v1/auth/signup').send(validUser);
    expect(res.status).toBe(409);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe('email_taken');
  });

  it('returns 400 with a field error for a bad email', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/signup')
      .send({ ...validUser, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'email' })]),
    );
    expect(res.body.requestId).toMatch(/^req_/);
  });

  it('returns 400 for a password shorter than 10 characters', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/signup')
      .send({ ...validUser, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].path).toBe('password');
  });

  it('never stores the password or the raw session token', async () => {
    const { cookie } = await signUp(ctx.app);
    const token = cookie.replace('sid=', '');
    const [user] = await ctx.db.select().from(users).where(eq(users.email, validUser.email));
    expect(user!.passwordHash).not.toBe(validUser.password);
    expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
    const stored = await ctx.db.select().from(sessions);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).not.toBe(token);
    expect(stored[0]!.id).toBe(hashToken(token));
  });
});

describe('POST /auth/login', () => {
  it('logs in with the right password', async () => {
    await signUp(ctx.app);
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(validUser.email);
    expect(cookieFrom(res)).toMatch(/^sid=/);
  });

  it('returns the same 401 for a wrong password and an unknown email', async () => {
    await signUp(ctx.app);
    const wrong = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: 'wrong-password-123' });
    const unknown = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password-123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.code).toBe('invalid_credentials');
    expect(unknown.body.detail).toBe(wrong.body.detail);
  });

  it('returns 429 on the sixth try within a minute', async () => {
    await signUp(ctx.app);
    const attempt = () =>
      request(ctx.app)
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: 'wrong-password-123' });
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    const sixth = await attempt();
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe('rate_limited');
    expect(sixth.headers['retry-after']).toBe('60');
  });
});

describe('GET /me and sessions', () => {
  it('returns 401 without a cookie', async () => {
    const res = await request(ctx.app).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('not_authenticated');
  });

  it('returns the user with a valid cookie', async () => {
    const { cookie } = await signUp(ctx.app);
    const res = await request(ctx.app).get('/api/v1/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(validUser.email);
  });

  it('returns 401 for a made-up cookie', async () => {
    const res = await request(ctx.app).get('/api/v1/me').set('Cookie', 'sid=made-up-token');
    expect(res.status).toBe(401);
  });

  it('stops accepting the cookie after logout', async () => {
    const { cookie } = await signUp(ctx.app);
    const out = await request(ctx.app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    const res = await request(ctx.app).get('/api/v1/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('rejects an expired session and removes it', async () => {
    const { cookie } = await signUp(ctx.app);
    await ctx.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await request(ctx.app).get('/api/v1/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(await ctx.db.select().from(sessions)).toHaveLength(0);
  });

  it('renews a session that is past half its life', async () => {
    const { cookie } = await signUp(ctx.app);
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day left
    await ctx.db.update(sessions).set({ expiresAt: soon });
    const res = await request(ctx.app).get('/api/v1/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const [stored] = await ctx.db.select().from(sessions);
    expect(stored!.expiresAt.getTime()).toBeGreaterThan(soon.getTime());
  });

  it('deletes sessions when the user is deleted (cascade)', async () => {
    await signUp(ctx.app);
    await ctx.db.delete(users);
    expect(await ctx.db.select().from(sessions)).toHaveLength(0);
  });
});

describe('PATCH /me', () => {
  it('changes the name', async () => {
    const { cookie } = await signUp(ctx.app);
    const res = await request(ctx.app)
      .patch('/api/v1/me')
      .set('Cookie', cookie)
      .send({ name: 'Alex R.' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alex R.');
  });

  it('refuses a new password when the current one is wrong', async () => {
    const { cookie } = await signUp(ctx.app);
    const res = await request(ctx.app)
      .patch('/api/v1/me')
      .set('Cookie', cookie)
      .send({ currentPassword: 'not-my-password', newPassword: 'a-brand-new-password' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].path).toBe('currentPassword');
  });

  it('changes the password, logs out old sessions and keeps this one logged in', async () => {
    const { cookie: oldCookie } = await signUp(ctx.app);
    const res = await request(ctx.app)
      .patch('/api/v1/me')
      .set('Cookie', oldCookie)
      .send({ currentPassword: validUser.password, newPassword: 'a-brand-new-password' });
    expect(res.status).toBe(200);
    const newCookie = cookieFrom(res);

    expect((await request(ctx.app).get('/api/v1/me').set('Cookie', oldCookie)).status).toBe(401);
    expect((await request(ctx.app).get('/api/v1/me').set('Cookie', newCookie)).status).toBe(200);

    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: 'a-brand-new-password' });
    expect(login.status).toBe(200);
  });

  it('returns 400 for an empty body', async () => {
    const { cookie } = await signUp(ctx.app);
    const res = await request(ctx.app).patch('/api/v1/me').set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
  });
});
