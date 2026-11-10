# beReady

An AI career assistant. You add what you have done, confirm each fact, paste a job posting, and get
a tailored one-page resume and cover letter built only from facts you confirmed.

**Status:** Phase 1 of 5 is built (accounts and the API contract). See [PLAN.md](PLAN.md).

## Run it

Needs Node 22 or newer.

```bash
cp server/.env.example server/.env
npm install
npm run dev
```

Then open http://localhost:5173. The API is at http://localhost:3001/api/v1.

No database to install: with `DATABASE_URL` empty, the server runs an embedded Postgres and keeps
its files in `server/pgdata/`. To use Neon or another Postgres, put its connection string in `DATABASE_URL`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the API and the React app together |
| `npm test` | Runs the server tests |
| `npm run typecheck` | Type-checks shared, server and client |
| `npm run lint` | Lints everything |
| `npm run db:generate` | Creates a migration after `schema.ts` changes |
| `npm run db:migrate` | Applies migrations (the server also does this on start) |

## Docs

- [PLAN.md](PLAN.md): the 5-phase build plan
- [docs/API.md](docs/API.md): every endpoint
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the parts fit
- [docs/decisions/](docs/decisions): why the big choices were made
- [docs/PHASE-1-NOTES.md](docs/PHASE-1-NOTES.md): what Phase 1 built, explained

## Stack

React, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS · Node, Express, Zod ·
Postgres (embedded PGlite in development, Neon in production), Drizzle ORM · Vitest, Supertest

## Privacy

Put your own resume files in `private/`. That folder, `.env` files and the local database folder are ignored by git.
