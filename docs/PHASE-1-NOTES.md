# Phase 1 notes: what was built and why

Read this next to the code. Every part is small enough to explain in an interview.

## What exists now

- One command, `npm run dev`, starts the API (port 3001) and the React app (port 5173).
- Anyone can sign up, log in, log out, change their name and change their password.
- The whole API is designed in `docs/API.md`. Phase 1 endpoints are built; the rest are the contract for later phases.
- 27 server tests pass. Typecheck and lint are clean.
- The database is Postgres: embedded (PGlite) on your Mac and in tests, Neon later in production.

## The files worth opening first

| File | What to notice |
| --- | --- |
| `shared/src/index.ts` | One Zod schema per request body. The server validates with it and the client gets its types from it. |
| `server/src/db/client.ts` | The only file that knows whether the database is embedded or a real server. |
| `server/src/app.ts` | The order of the middleware is the order a request travels through. |
| `server/src/lib/sessions.ts` | The cookie holds a random token; the database holds only its hash. |
| `server/src/routes/auth.ts` | Signup, login, logout, with rate limits. |
| `server/src/middleware/errors.ts` | The one place errors become responses. |
| `server/test/auth.test.ts` | Each test is one sentence about how the API must behave. |
| `client/src/api/client.ts` | The only `fetch` in the app. Errors become an `ApiError` with field messages. |
| `client/src/hooks/useAuth.ts` | "Who is logged in?" is always answered by `GET /me`. |

## Key decisions, in plain language

1. **Sessions, not JWTs.** I can log someone out by deleting a row. See `docs/decisions/0002`.
2. **The database never holds anything usable.** Passwords are Argon2id hashes. Session tokens are SHA-256 hashes.
3. **Login never says which part was wrong.** A wrong password and an unknown email give the same answer, and take the same time, because an unknown email is still checked against a dummy hash.
4. **Rate limits on auth.** 5 login tries per minute per IP and email, 10 signups per hour per IP.
5. **One error format.** Every error is problem details JSON with a `code` the client can switch on and a `requestId` that matches the server log.
6. **`createApp()` does not listen.** Tests build the app with an in-memory Postgres and send real HTTP requests to it.
8. **Postgres from day one.** Production will be Neon, so development uses an embedded Postgres instead of SQLite. One dialect, one schema, still no setup. See `docs/decisions/0001`.
7. **The client never guesses the login state.** It asks `GET /me`. Nothing is kept in localStorage.

## Changes from the plan

- `SESSION_SECRET` was dropped. Session tokens are random and stored hashed, so there is nothing to sign and no secret to manage.
- `APP_ORIGIN` was added. In development Vite forwards `/api` calls and rewrites the Host header, so the server needs to be told the browser's address for the cross-site check. A real browser test caught this.
- The database changed from SQLite to Postgres on the same day, because deployment will use Neon.
- A `403 bad_origin` error was added to the error table for that check.

## A bug worth remembering

The first version of the cross-site check compared the `Origin` header with the `Host` header.
All unit tests passed, but signing up in a real browser failed with 403, because the Vite dev
proxy changes `Host` to `localhost:3001` while the browser's origin is `localhost:5173`.
The fix was the `APP_ORIGIN` setting. Lesson: test through the same path your users take.

## Try it yourself (the Phase 1 checklist)

1. `cp server/.env.example server/.env`, then `npm install`, then `npm run dev`.
2. Open http://localhost:5173 and sign up. Refresh the page: you stay logged in.
3. Log out, then log in with a wrong password six times: the sixth says to wait.
4. `npm test` and `npm run typecheck`.
5. Read `server/drizzle/0000_init.sql`: the tables have a `password_hash` column and no password column, and `sessions.id` holds a hash, not the cookie value.
