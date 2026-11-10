import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import { makeApp, validUser, type TestContext } from './helpers';

let ctx: TestContext;
beforeEach(async () => {
  ctx = await makeApp();
});

describe('GET /health', () => {
  it('reports the server and database are up', async () => {
    const res = await request(ctx.app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok' });
    expect(res.headers['x-request-id']).toMatch(/^req_/);
  });
});

describe('errors', () => {
  it('returns problem details for an unknown endpoint', async () => {
    const res = await request(ctx.app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 404, code: 'not_found', type: '/errors/not-found' });
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('cross-site request protection', () => {
  it('blocks a POST whose Origin is another site', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/signup')
      .set('Origin', 'https://evil.example')
      .send(validUser);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('bad_origin');
  });

  it('allows a POST whose Origin matches the Host', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/signup')
      .set('Host', 'localhost:5173')
      .set('Origin', 'http://localhost:5173')
      .send(validUser);
    expect(res.status).toBe(201);
  });
});

describe('loadEnv', () => {
  it('fills in defaults and treats empty keys as missing', () => {
    const env = loadEnv({ ANTHROPIC_API_KEY: '' });
    expect(env.PORT).toBe(3001);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('fails with a clear message when a value is wrong', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/Invalid server\/\.env settings[\s\S]*PORT/);
  });
});
