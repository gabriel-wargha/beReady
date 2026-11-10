# Architecture

## The big picture

```
Browser (React app)
      |  only calls /api/v1, session cookie
      v
Express server
  routes  ->  services  ->  domain (pure logic)
                 |
                 +--> db (Drizzle)  ->  Postgres (embedded in dev, Neon in production)
                 +--> ai client     ->  Claude API   (server key)      Phase 2
                 +--> github client ->  GitHub API   (server token)    Phase 2
                 +--> parsers / exporters (PDF, .docx)                 Phases 2 and 4
```

The browser never talks to Claude or GitHub. API keys live only in `server/.env`.

In development there are two processes: Vite on port 5173 serves the React app and forwards
`/api` to Express on port 3001. In production (Phase 5) Express serves the built React files
itself, so there is one process and one address.

## Folders

| Folder | Job |
| --- | --- |
| `shared/` | Zod schemas and TypeScript types for every request and response. Imported by both sides. |
| `server/src/routes/` | HTTP only: validate the request, call the logic, send the response |
| `server/src/services/` | Use cases such as "import a resume" (starts in Phase 2) |
| `server/src/domain/` | Pure functions: match score, guardrail, linter, page fit (starts in Phase 3) |
| `server/src/lib/` | Small helpers: IDs, password hashing, sessions, the error type |
| `server/src/middleware/` | Request ID, auth, validation, origin check, error handler |
| `server/src/db/` | Drizzle schema, database connection, migrations runner |
| `server/drizzle/` | Generated SQL migrations. Committed, never edited by hand. |
| `client/src/api/` | The one `api()` function and typed calls built on it |
| `client/src/hooks/` | React hooks that wrap API calls with TanStack Query |
| `client/src/pages/`, `components/` | Screens and shared UI pieces |

## What happens on one request

Example: `PATCH /api/v1/me` with a new name.

1. `requestId` gives the request an ID (`req_...`) and sets the `X-Request-Id` header.
2. `pino-http` logs method, URL and status. Never headers, cookies or bodies.
3. `helmet` adds security headers.
4. `express.json` parses the body (1 MB limit).
5. `checkOrigin` refuses data-changing requests that come from another website.
6. `requireAuth` reads the `sid` cookie, hashes it, finds the session, and puts the user on `req.user`.
7. `validateBody(updateMeBodySchema)` checks the body against the shared Zod schema.
8. The route handler updates the row and returns the user through `toUser()`, which is the only
   place a user row is turned into JSON (so the password hash can never leak).
9. If anything threw, `errorHandler` turns it into a problem details response.

## How sign-in works

- Signup hashes the password with Argon2id and stores only the hash.
- Login creates a session: 32 random bytes go to the browser in an httpOnly cookie, and the
  SHA-256 hash of those bytes is stored in the `sessions` table.
- On each request the server hashes the cookie value and looks it up. A leaked database
  therefore contains nothing that can be used as a cookie.
- Sessions last 30 days and are extended when used in their second half.
- Logout deletes the row. A password change deletes all of the user's rows.

## How tests work

`createApp({ db, env })` builds the app without listening on a port. Each test file starts an
in-memory Postgres (PGlite), runs the real migrations on it, empties the tables before every test, and sends real HTTP requests through
Supertest. Nothing is mocked in Phase 1.
