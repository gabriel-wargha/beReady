# 3. 202 Accepted and polling for AI work

**Status:** accepted (built in Phase 2) · **Date:** 2026-11-09

## Context

Extracting facts, analyzing a posting and writing a resume each call the Claude API and can take
many seconds. Hosts and browsers cut off slow requests, and a user who refreshes would lose the result.

## Decision

Endpoints that use AI answer immediately with `202 Accepted`, a task ID and a `Location` header.
The work runs in an in-process queue and its state is saved in a `tasks` table. The client polls
`GET /tasks/:id` every 2 seconds. These endpoints accept an `Idempotency-Key` header so a double
click does not start, or pay for, the same work twice.

## Why

- No request is held open, so nothing times out.
- The result survives a page refresh because the task is in the database.
- Polling is simple to build, test and explain. TanStack Query has it built in.

## Trade-offs

- Up to 2 seconds of extra delay before the user sees a result. Streaming would feel faster and
  could be added later for document generation.
- How the work runs depends on the host. On a long-running server an in-process queue is enough.
  On serverless hosting such as Vercel, a function may stop after it responds, so the task runner
  must not depend on server memory. This is designed in Phase 2 before any AI endpoint is built.
  The API contract (202, task ID, polling) is the same either way.
