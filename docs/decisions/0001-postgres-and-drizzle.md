# 1. Postgres with Drizzle ORM, embedded for development

**Status:** accepted · **Date:** 2026-11-09 · Replaces the first version of this record (SQLite)

## Context

The app must run on a laptop with no setup. In production the database will be Neon, which is
hosted Postgres. Phase 1 was first built on SQLite, then switched the same day, while the schema
was only two tables.

## Decision

Use Postgres everywhere, with Drizzle ORM for typed queries and `drizzle-kit` for migrations.

- When `DATABASE_URL` is set, the server connects to that Postgres server (Neon in production).
- When it is empty, the server runs PGlite: a real Postgres engine embedded in the Node process,
  storing its files in `./pgdata`. Tests use the same engine in memory.

`server/src/db/client.ts` is the only file that knows which of the two is running.

## Why

- **One SQL dialect.** Drizzle needs a different schema file for SQLite and for Postgres. Using
  SQLite locally and Postgres in production would mean two schemas and bugs that only appear after deploying.
- **Still zero setup.** `npm install` and `npm run dev` are enough. No Docker, no local Postgres, no account.
- **Tests run on the real thing.** Each test file starts an in-memory Postgres and applies the real migrations.
- **Typed schema.** A renamed column is a compile error, not a runtime surprise.

## Trade-offs

- Every query is now `await`ed, because Postgres drivers are asynchronous.
- The embedded engine takes about a second to start, so tests share one per file and empty the
  tables between tests.
- PGlite allows one connection, which is fine for one developer. Production uses a real pool.
