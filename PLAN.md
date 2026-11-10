# beReady – AI Career Assistant: 5-Phase Build Plan

Nov 9, 2026 · Gabriel Wargha

**Progress:** Phase 1 is built (see `docs/PHASE-1-NOTES.md`). Next: Phase 2, after your OK.

## Overview

beReady is a web app where anyone can sign up, enter their work history, projects and skills, and get an AI-written resume and cover letter tailored to a job posting. Every sentence the AI writes must trace back to a fact the user confirmed, and that rule is checked in code, not just asked for in a prompt.

**Who it is for:** students and early-career job seekers applying to campus jobs and internships. You are the first real user: your own resume and facts go into your account, and a fictional sample person powers the public demo.

**How people get their info in:** type it into forms, paste a resume as text, upload a PDF or .docx, or enter a GitHub username to import public repos. The AI turns all of it into a fact bank, and the user confirms each fact before it can be used.

**The one-sentence interview pitch:** "I designed, built and deployed a multi-user REST API in TypeScript that turns a person's confirmed work history into tailored resumes with Claude, and I wrote a guardrail that rejects any AI-written line it can't trace to a confirmed fact."

**What changed from the first build prompt:**

- Anyone can sign up, so there are accounts, per-user data, and limits on AI use.
- Deploying is now Phase 5. Nothing goes online before that phase, and only after you say go.
- Your personal resume files never go in the repo. Tests use a fictional person, because the repo will be public on your GitHub.

**How every phase runs:** Claude Code builds the phase in small steps. At the end it explains what it built and the key decisions in plain language, you run the phase's "Done when" checklist yourself, and the next phase starts only after your OK.

**The five phases.** Each ends with a demo you run yourself and waits for your OK:

1. **Foundation, API contract and accounts:** sign up and log in on your Mac; every endpoint documented.
2. **Fact bank:** type, paste, upload or import from GitHub; confirm facts one at a time.
3. **Job workspace:** paste a posting; get a match score with evidence, gaps, a tracker and interview prep.
4. **AI-written resume and cover letter:** one page, your layout, .docx and PDF, plus review mode.
5. **Public launch:** limits, demo mode, security, CI and deploy, after you say go.

## Decisions I made for you

These are my defaults so the plan is complete. Change any of them before Phase 1 starts; each one only affects the phase listed.

| Decision | My default | Why | If you'd rather | Phase |
| --- | --- | --- | --- | --- |
| Sign-in | Email and password, Argon2id password hashing, server-side sessions stored in the database, httpOnly cookie | No third party to depend on, and you can explain every line of it in an interview | Sign in with Google or GitHub (OAuth) | 1 |
| Password reset | Email link sent through Resend | Anyone who signs up needs a way back in | Skip it at launch and add Google sign-in instead. Sending email needs a domain you own | 5 |
| Hosting | Neon (Postgres) for the database and Vercel for the app, set up only in Phase 5 | Your choice. Both have free plans to start with; check their current limits before launch | Any Node host with a Postgres database | 5 |
| Who pays for AI | You, with limits: 20 AI actions per user per day, 5 for demo users, and a monthly budget cap that pauses AI for everyone when reached | Without limits, one stranger could spend your whole API budget | A "bring your own Claude API key" setting | 5 (tracking starts in 2) |
| Uploaded files | Parsed in memory, then thrown away. Only the extracted text is saved, and the user can delete it | Less private data to protect if something goes wrong | Keep the original files in storage | 2 |
| Public demo | A "Try it" button makes a temporary account with a fictional student and two sample job postings, deleted after 24 hours | Recruiters can try it in one click without signing up | Screenshots and a video in the README only | 5 |
| AI models | `claude-sonnet-5-5` for writing and matching, `claude-haiku-5-5` for extraction and quick checks, both set in `.env` | The cheaper model handles the high-volume parsing work | One model everywhere | 2 |
| Front-end extras | Tailwind CSS for styling, TanStack Query for API calls | TanStack Query has polling built in, which the long AI tasks need | Plain CSS modules and `fetch` | 1 |
| Repo layout | `client/`, `server/`, plus a small `shared/` folder for the Zod schemas both sides use | One definition of every request and response shape, so the client and server can't drift apart | Duplicate the types in each folder | 1 |
| App name | beReady, from your folder name | Short and easy to say in an interview | Anything you like | 1 |

## Architecture

One Express server does everything in production: it serves the built React app and the REST API from the same address, so there is no CORS setup and the login cookie just works. The browser only ever calls `/api/v1/...`. Only the server talks to Claude and GitHub, using keys from `server/.env`.

```
Browser (React app)
      |  only calls /api/v1, session cookie
      v
Express server
  routes  ->  services  ->  domain (pure logic)
                 |
                 +--> db (Drizzle)  ->  Postgres
                 +--> ai client     ->  Claude API   (server key)
                 +--> github client ->  GitHub API   (server token)
                 +--> parsers / exporters (PDF, .docx)
```

### Stack

| Part | Choice | What it does here |
| --- | --- | --- |
| Front end | React + TypeScript, Vite, React Router | Pages and routing |
| Server state | TanStack Query | Caching API data and polling long AI tasks |
| Styling | Tailwind CSS | Fast, consistent styling |
| API | Node + Express + TypeScript | The REST API |
| Validation | Zod, shared by client and server | Every request body, query and AI response is checked against a schema |
| Database | Postgres + Drizzle ORM, drizzle-kit migrations. Embedded PGlite on your Mac and in tests, Neon in production | One SQL dialect everywhere, still no setup locally |
| AI | Anthropic TypeScript SDK, structured outputs | Extraction, matching, writing |
| GitHub | GitHub REST API with a server token | Public repo import |
| Parsing | unpdf (PDF text), mammoth (.docx text) | Turning uploads into plain text |
| Exports | docx (Word files), pdfkit (PDF with built-in Times fonts) | Resume and cover letter downloads |
| Uploads | multer, memory storage, 5 MB limit | Files never touch the disk |
| Security | helmet, express-rate-limit, Argon2id | Headers, brute-force limits, password hashing |
| Logging | pino with redaction | Request logs that never contain resume text or passwords |
| Tests | Vitest + Supertest; Playwright for one end-to-end run | Logic, routes, and one full user journey |
| Dev command | npm workspaces + concurrently | `npm run dev` starts client and server together |
| Ship | GitHub Actions, Vercel, Neon | Phase 5 only |

### Repo layout

```
beready/
  package.json            npm workspaces; "dev" runs client + server
  client/                 Vite + React app
    src/pages/  src/components/  src/api/ (typed calls)  src/hooks/
  server/
    src/app.ts            builds the Express app (tests import this)
    src/index.ts          starts listening
    src/config/env.ts     reads .env and fails fast if a key is missing
    src/routes/           HTTP only: validate, call a service, respond
    src/services/         use cases: import, analyze, generate, review
    src/domain/           pure logic: match score, guardrail, linter, page fit
    src/ai/               Claude client, fake client for tests, prompts/
    src/db/               Drizzle schema, migrations, scoped queries
    src/parsers/          pdf.ts, docx.ts
    src/exporters/        docx.ts, pdf.ts, templates/classic.ts
    src/middleware/       auth, errors, rate limits, AI quota
    src/tasks/            runner for long AI jobs
    test/fixtures/        a fictional person's resume, postings, letters
  shared/                 Zod schemas + TypeScript types for every endpoint
  docs/
    API.md                every endpoint, written before the code
    ARCHITECTURE.md       this diagram and the layers
    decisions/            one short file per big decision (ADRs)
  .github/workflows/      CI (Phase 5)
```

### Server layers

1. **routes/** only deals with HTTP: read the request, validate it with Zod, call one service, send the response.
2. **services/** holds the use cases, such as "import a resume" or "generate a resume for job 12". Services talk to the database and the AI layer.
3. **domain/** holds pure functions with no database and no network: the match score, the guardrail checks, the AI-writing linter, the one-page fitter. Most tests live here because pure functions are easy to test.
4. **ai/** is one interface with two versions: the real Claude client and a fake that returns saved answers. Tests never call the real API, so they are free, fast and always give the same result.
5. **db/** holds the Drizzle schema and a `forUser(userId)` helper, so every query is filtered by the logged-in user by default.

### The no-invented-facts guardrail

The AI chooses and rewords. Code checks. Every generated resume, letter and interview answer goes through these rules in `domain/guardrail.ts`:

1. Every line the AI writes must list the fact IDs it is based on.
2. Each cited fact must exist, belong to this user, and be confirmed.
3. Every number in the line (300+, 100,000+, 4.0) must appear in one of its cited facts.
4. A skill named under a job needs a confirmed fact from that same job linked to that skill. This is your "Python was in class, not at FamilySearch" rule, made general for every user.
5. Nothing marked false may appear anywhere, matched by whole words and ignoring case.
6. Job titles, organizations, locations and dates are printed by code straight from the database. The AI never types them.

A line that breaks a rule gets one repair attempt with the reason attached. If it still fails, it is dropped and listed in the document's check report. If the AI wants a fact that is still "needs confirmation", that becomes a question for the user instead of a sentence.

The pipeline every generated document goes through:

1. **Generate:** the model picks and rewords facts, citing fact IDs.
2. **Check:** the guardrail rules run on every line.
3. **Repair:** failing lines get one retry with the reason, then are dropped.
4. **Fit:** the page fitter trims to one page.
5. **Lint:** the AI-writing linter runs on cover letters.
6. **Save and export:** the version is saved with its check report, then rendered to .docx and PDF.

### How the AI answers are kept in shape

Each AI function has a Zod schema in `shared/`. The server turns it into JSON Schema and sends it as `output_config.format`, so Claude must answer in exactly that shape ([structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). The server still validates the answer with Zod, because the docs note that a refusal or hitting `max_tokens` can produce output that doesn't match. On a bad answer it retries once, then returns a clear 502 error.

Every prompt lives in `ai/prompts/` with a version string. The prompt version and model name are saved with every generated result, so you can always say which prompt produced which resume.

### How long AI requests work

An AI request can take many seconds, longer than a normal HTTP request should wait. So those endpoints answer right away with `202 Accepted` and a task ID, and the client polls `GET /api/v1/tasks/:id` every 2 seconds until the task is done. Task state is saved in a `tasks` table. Because the app will run on Vercel, where a function can stop after it responds, the task runner is designed in Phase 2 so it does not depend on server memory. The API contract stays the same either way.

## Data model

The app has 20 tables. Every row of user data carries a `user_id` with `ON DELETE CASCADE`, so deleting an account removes everything that person ever stored in one statement. Drizzle migrations are committed, so the database on your Mac and on the server are built the same way.

| Table | Main fields | Phase |
| --- | --- | --- |
| users | id, email (unique), password\_hash, name, is\_demo, demo\_expires\_at, created\_at | 1 |
| sessions | id (hash of the cookie token), user\_id, expires\_at, created\_at | 1 |
| sources | id, user\_id, kind (typed, pasted, pdf, docx, github, answer), label (file name or repo), text, created\_at | 2 |
| imports | id, user\_id, source\_id, status, proposals (JSON of items waiting for review) | 2 |
| experiences | id, user\_id, kind (work, education, project, volunteer, leadership), title, organization, location, start\_date, end\_date, is\_current, url, source\_id, sort\_order | 2 |
| facts | id, user\_id, experience\_id (optional), kind (achievement, responsibility, award, education detail, language, other), text, status (confirmed, needs confirmation, false), source\_id, confirmed\_at, updated\_at | 2 |
| skills | id, user\_id, name (unique per user, ignoring case), category, status | 2 |
| fact\_skills | fact\_id, skill\_id: which facts prove a skill, and so at which job or class it was used | 2 |
| learning\_items | id, user\_id, topic, reason, job\_id (optional), status (to do, learning, done) | 2 |
| jobs | id, user\_id, title, organization, department, location, url, pay, hours, deadline, posting\_text, status (not applied, applied, interview, offer, rejected), date\_applied, match\_score, notes | 3 |
| job\_events | id, job\_id, from\_status, to\_status, created\_at: the job's timeline | 3 |
| requirements | id, job\_id, text, kind (required, preferred), category (skill, experience, education, document, schedule), credit (0, 0.5, 1), reasoning, gap\_type (learn before interview, long term) | 3 |
| requirement\_evidence | requirement\_id, fact\_id | 3 |
| interview\_preps | id, job\_id, questions (JSON: question, sample answer, fact IDs), created\_at | 3 |
| documents | id, user\_id, job\_id (optional), type (resume, cover letter), version, template, content (JSON: sections and lines, each line with its fact IDs), check\_report (JSON), page\_count, model, prompt\_version, created\_at | 4 |
| style\_profiles | user\_id, traits (JSON), signature\_phrases (JSON), sample\_source\_ids, updated\_at | 4 |
| reviews | id, user\_id, source\_id, result (JSON: line suggestions, claim checks, page count, mismatches), created\_at | 4 |
| tasks | id, user\_id, type, status (queued, running, succeeded, failed), input, result\_ref, error, created\_at, finished\_at | 2 |
| ai\_usage | id, user\_id, task\_id, model, input\_tokens, output\_tokens, est\_cost\_usd, created\_at | 2 |
| password\_reset\_tokens | token\_hash, user\_id, expires\_at, used\_at | 5 |

Two modeling choices worth explaining in an interview: facts are separate from experiences so one job can have many provable bullets, each with its own status and source; and the `fact_skills` link is what lets the app know *where* a skill was used, which is the data behind guardrail rule 4.

## REST API design

The whole API is designed and written into `docs/API.md` in Phase 1, before any route exists. Each later phase builds endpoints that are already documented, and any change to the design is made in `API.md` first.

### Conventions

- **Base path** `/api/v1`. JSON in and out, except file uploads (multipart) and exports (file downloads). Fields are camelCase, dates are ISO 8601.
- **IDs** are random strings with a type prefix (`fct_`, `job_`, `doc_`, `tsk_`), so they can't be guessed and logs are easy to read.
- **Status codes:** 200 OK, 201 Created with a `Location` header, 202 Accepted for AI work, 204 No Content for deletes and logout.
- **Lists** take `?limit=20&offset=0`, filters such as `?status=confirmed`, and `?sort=-createdAt`, and return `{ "data": [...], "page": { "limit": 20, "offset": 0, "total": 57 } }`.
- **Auth** is a session cookie (httpOnly, Secure in production, SameSite=Lax). Every POST, PATCH and DELETE also has its `Origin` header checked to block cross-site requests.
- **Other people's data** returns 404, never 403, so nobody can probe which IDs exist.
- **Long AI work** returns `202` with `Location: /api/v1/tasks/tsk_...`. The client polls that task until `status` is `succeeded` or `failed`.
- **Double clicks:** endpoints that start AI work accept an `Idempotency-Key` header. The same key within 24 hours returns the same task instead of starting (and paying for) a second one.
- **Docs:** each endpoint in `API.md` lists method, path, auth, request, response, errors and a curl example. In Phase 5 the same Zod schemas also generate an OpenAPI file, shown with Swagger UI at `/api/docs`.

### Error format

Every error uses the RFC 9457 "problem details" shape with `Content-Type: application/problem+json`:

```json
{
  "type": "/errors/validation-failed",
  "title": "Request body is invalid",
  "status": 400,
  "code": "validation_failed",
  "detail": "2 fields are invalid.",
  "errors": [{ "path": "email", "message": "Must be a valid email" }],
  "requestId": "req_7Hk2..."
}
```

| Status | `code` values | When |
| --- | --- | --- |
| 400 | validation\_failed | Body, query or params fail the Zod schema |
| 401 | not\_authenticated, invalid\_credentials | No session, or wrong email or password |
| 403 | bad\_origin | A data-changing request came from another website |
| 404 | not\_found | Doesn't exist, or belongs to someone else |
| 409 | email\_taken, already\_exists | Duplicate email or duplicate skill |
| 413 | file\_too\_large | Upload over 5 MB |
| 415 | unsupported\_file\_type | Not a real PDF or .docx (checked by file signature, not just the name) |
| 422 | no\_text\_found, job\_not\_analyzed, needs\_confirmation | Scanned PDF with no text, scoring before analysis, or generation blocked on unconfirmed facts |
| 429 | rate\_limited, ai\_daily\_limit | Too many requests or AI actions; includes a `Retry-After` header |
| 502 | ai\_bad\_response, github\_unavailable | Claude or GitHub failed after one retry |
| 503 | ai\_paused | Monthly AI budget reached |

### Endpoint map

| Method | Path | What it does | Phase |
| --- | --- | --- | --- |
| GET | /health | Server and database are up | 1 |
| POST | /auth/signup | Create an account and start a session | 1 |
| POST | /auth/login | Start a session | 1 |
| POST | /auth/logout | End the session | 1 |
| GET | /me | The logged-in user | 1 |
| PATCH | /me | Change name or password | 1 |
| GET | /tasks/:id | Status and result of an AI task | 2 |
| GET | /me/usage | AI actions used today and the daily limit | 2 |
| GET, POST | /experiences | List or add jobs, education, projects | 2 |
| GET, PATCH, DELETE | /experiences/:id | One experience with its facts | 2 |
| GET, POST | /facts | List (filter by status, experience, kind, text) or add facts | 2 |
| PATCH, DELETE | /facts/:id | Edit text, status or linked skills | 2 |
| GET, POST | /skills | List or add skills | 2 |
| PATCH, DELETE | /skills/:id | Edit or remove a skill | 2 |
| POST | /imports | Pasted text or an uploaded PDF or .docx; starts extraction (202) | 2 |
| GET | /imports/:id | Extracted experiences, facts and skills waiting for review | 2 |
| POST | /imports/:id/commit | Save the items the user accepted or edited | 2 |
| GET | /github/repos?username= | A user's public repos to choose from | 2 |
| POST | /imports/github | Import chosen repos: description, languages, README summary (202) | 2 |
| GET | /confirmations/next | The next fact to confirm (204 when none are left) | 2 |
| POST | /confirmations/:factId | Answer true, false, or "add it, I'll learn it" | 2 |
| GET | /learning-items | The learning list | 2 |
| PATCH, DELETE | /learning-items/:id | Mark learning or done, or remove | 2 |
| GET, POST | /jobs | Tracker list (filter, sort) or save a new posting | 3 |
| GET, PATCH, DELETE | /jobs/:id | One job; change status, date applied, notes | 3 |
| POST | /jobs/:id/analysis | Pull out requirements, pay, schedule, documents; then score (202) | 3 |
| GET | /jobs/:id/match | Each requirement with credit, evidence and gap type, plus the score | 3 |
| POST | /jobs/:id/match/refresh | Re-score after new facts are confirmed (202) | 3 |
| GET | /jobs/:id/events | The job's status timeline | 3 |
| POST | /jobs/:id/interview-prep | Generate 5 to 7 questions with sample answers (202) | 3 |
| GET | /jobs/:id/interview-prep | The saved questions and answers | 3 |
| GET | /templates | Available resume layouts | 4 |
| POST | /documents | Generate a resume or cover letter, for a job or general (202) | 4 |
| GET | /documents | List versions (filter by job and type) | 4 |
| GET, PATCH, DELETE | /documents/:id | Content with fact IDs and check report; manual edits save a new, re-checked version | 4 |
| GET | /documents/:id/export?format=docx or pdf | Download the file | 4 |
| GET, PATCH | /style-profile | The user's writing style for cover letters | 4 |
| POST | /style-profile | Build the style from past cover letters (202) | 4 |
| POST | /reviews | Upload any resume or letter for review (202) | 4 |
| GET | /reviews/:id | Line-by-line suggestions and checks | 4 |
| POST | /demo | Start a session in a fresh demo account | 5 |
| POST | /auth/password-reset | Email a reset link (always answers 202, so emails can't be probed) | 5 |
| POST | /auth/password-reset/confirm | Set a new password with the emailed token | 5 |
| GET | /me/export | Download all my data as JSON | 5 |
| DELETE | /me | Delete my account and all my data | 5 |

## Phase 1: Foundation, API contract and accounts

**Goal:** a repo that runs with one command, a fully written API design, and real accounts. At the end, anyone on your Mac can sign up, log in and see an empty dashboard.

### Build

1. **Repo setup**
   - npm workspaces for `client/`, `server/` and `shared/`, TypeScript strict mode in all three, ESLint and Prettier.
   - `.gitignore` covers `.env`, `*.db`, and a `private/` folder for your own resume files, so personal data can't be committed by accident.
   - `server/.env.example` lists every key name with no values: `PORT`, `DATABASE_URL`, `APP_ORIGIN`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `AI_MODEL_SMART`, `AI_MODEL_FAST`, `AI_DAILY_LIMIT`, `AI_MONTHLY_BUDGET_USD`.
   - Scripts: `npm run dev` (Vite on port 5173, proxying `/api` to Express on 3001), `npm test`, `npm run typecheck`, `npm run db:generate`, `npm run db:migrate`.
2. **API design first**
   - Write `docs/API.md` for every endpoint in the map above, all phases.
   - Write `docs/ARCHITECTURE.md` and the first three decision records: Postgres and Drizzle, session cookies instead of JWTs, and 202 plus polling for AI work.
   - Put the request and response Zod schemas in `shared/` as they are written.
3. **Server skeleton**
   - `app.ts` builds the app without listening, so tests can import it.
   - `config/env.ts` validates `.env` with Zod and stops the server with a clear message if a key is missing.
   - Middleware: request ID, pino logger, helmet, 1 MB JSON limit, a `validate(schema)` helper, a 404 handler, and one error handler that always returns problem details.
   - `GET /health` checks the database too.
4. **Database**
   - Drizzle schema and first migration for `users` and `sessions`. Each later phase adds its own tables with its own migration.
    - With `DATABASE_URL` empty the server runs an embedded Postgres (PGlite) in `./pgdata`; with it set, it connects to that Postgres server.
5. **Accounts**
   - Signup, login, logout, `GET /me`, `PATCH /me`.
   - Passwords hashed with Argon2id. Minimum 10 characters.
   - Session token = 32 random bytes in the cookie; only its SHA-256 hash is stored, so a leaked database can't be used to log in. Sessions last 30 days and renew when used.
   - Login is limited to 5 tries per minute per IP and email, and the error never says which of the two was wrong.
   - A `requireAuth` middleware puts the user on the request and returns 401 otherwise.
6. **Client**
   - Routes: `/` (landing page), `/signup`, `/login`, and a protected `/app` layout with Dashboard, Fact bank, Jobs, Documents, Review and Settings. Empty pages say which phase fills them.
   - A typed API client in `client/src/api/` that uses the shared types and turns problem details into form errors next to the right field.
   - Auth state comes from `GET /me` through TanStack Query.

### Tests

- Each test file gets an in-memory Postgres (PGlite) with migrations applied, emptied before every test.
- Signup returns 201 and a cookie; a duplicate email returns 409; a bad email returns 400 with an `errors` entry for `email`.
- Wrong password returns 401; the sixth try in a minute returns 429.
- `GET /me` without a cookie returns 401; after logout the old cookie stops working.
- The stored hash never equals the password, and the stored session ID never equals the cookie value.

### Done when

- [ ] From a fresh clone, copying `.env.example` to `.env` and running `npm install` then `npm run dev` starts both apps
- [ ] You can sign up, log out, log in, and refresh without being logged out
- [ ] `docs/API.md` covers every endpoint in the map with request, response, errors and a curl example
- [ ] `npm test` and `npm run typecheck` both pass
- [ ] `git log` shows small commits, and no `.env` or `.db` file is tracked

### Say it in an interview

"I designed the API before writing it, so the front end and back end were built against one contract. I chose server sessions over JWTs because I can revoke a session instantly by deleting a row, and an httpOnly cookie can't be read by injected JavaScript."

## Phase 2: Fact bank

**Goal:** anyone can get their whole history into beReady four ways (forms, pasted text, an uploaded file, GitHub), review what the AI pulled out, and confirm facts one question at a time. Nothing the AI extracts can be used until the user confirms it.

### Build

1. **Tables and migration:** `sources`, `imports`, `experiences`, `facts`, `skills`, `fact_skills`, `learning_items`, `tasks`, `ai_usage`.
2. **Hand entry:** full create, read, update and delete for experiences, facts and skills. A fact the user types in themselves is saved as confirmed, with source "typed".
3. **AI layer foundation**
   - `ai/client.ts` defines one interface: send a prompt and a schema, get back typed data.
   - The real version uses the Anthropic SDK with `output_config.format`. The fake version returns fixture files and is used in every test.
   - Every real call writes an `ai_usage` row from the response's token counts.
   - An AI quota middleware checks today's count before any AI work and returns 429 `ai_daily_limit` when it's used up.
    - The task runner: a `tasks` table, a runner that does not depend on server memory (see Architecture), and `GET /tasks/:id`.
4. **Paste and upload import**
   - `POST /imports` takes either `{ "text": "..." }` or a multipart file.
   - Files are checked by size (5 MB) and by their real signature: a PDF starts with `%PDF`, and a .docx is a zip containing `word/document.xml`. A renamed .txt is refused with 415.
   - unpdf or mammoth pulls the text out in memory, and the file is dropped. A scanned PDF with no text returns 422 `no_text_found` with a tip to paste the text instead.
   - A task asks the fast model to extract experiences, facts (each tied to its experience) and skills (each with where it was used), in a strict schema.
   - Possible duplicates are flagged in code: the text is lowercased, punctuation removed, and word overlap with existing facts is measured. Anything over 80% overlap is marked "possible duplicate" with a link to the existing fact.
5. **Review screen:** each extracted item has Confirm, Keep for later (needs confirmation), Edit, or Discard, plus a "Confirm all in this job" button. `POST /imports/:id/commit` saves each item with the chosen status and its source.
6. **Onboarding wizard for new users:** (1) paste or upload a resume, or skip; (2) work and volunteer experience; (3) projects, with an optional GitHub username; (4) education and skills; then the review screen.
7. **GitHub import**
   - `GET /github/repos?username=` lists public repos, newest push first, forks hidden by default.
   - The import task fetches each chosen repo's description, languages, topics, last push date and README, then asks the AI for 2 to 4 candidate facts per project.
   - Calls use a server token (60 requests an hour without one, 5,000 with one) and responses are cached for 10 minutes.
8. **Confirmation questions**
   - `GET /confirmations/next` returns one unconfirmed fact with its source snippet. In Phase 3, facts that a saved job needs come first.
   - The UI shows one card at a time: True, False, "Add it, I'll learn it", or Edit then confirm.
   - "I'll learn it" keeps the fact unusable and adds a learning item. When that item is marked done, the app asks to confirm the fact.
9. **Fact bank page:** facts grouped by experience, status chips, filters and search, edit in place, the source shown on each fact ("from resume-2025.pdf"). The dashboard shows how many facts are waiting for confirmation.
10. **You as user #1:** import your current resume, a past cover letter and your GitHub, then check the result against the starting facts in your build prompt. Mark R, 3D printing, Adobe apps and the rest as false.

### Tests

- Extraction: the fake AI returns a fixture and the proposals have the right shape; a malformed answer is retried once, then returns 502.
- Uploads: a renamed .txt gets 415, a 6 MB file gets 413, a scanned PDF fixture gets 422.
- Parsers pull the expected lines out of a fixture PDF and a fixture .docx.
- The duplicate check, as a pure function, with near-matches and non-matches.
- Commit saves each item with the chosen status and its `source_id`.
- Ownership: one shared helper proves user B gets 404 on user A's experiences, facts, skills, imports and tasks.
- Confirmations: each answer sets the right status, "learn" creates a learning item, and `next` returns 204 when nothing is left.
- Quota: the 21st AI action in a day returns 429, and every AI call writes an `ai_usage` row.
- GitHub (with `fetch` mocked): forks are skipped, and an unknown username returns 404.

### Done when

- [ ] A new user gets from signup to a reviewed fact bank using forms, pasted text, an uploaded file and GitHub
- [ ] Your own resume imports and its facts match your starting facts list after review
- [ ] Every fact shows where it came from and its status
- [ ] Tests prove one user can never see another user's data
- [ ] `npm test` passes

### Say it in an interview

"I treat AI extraction as a proposal, not as truth. Every fact keeps its source and a status, and only facts the user confirmed can be used later. The model has to answer in a fixed JSON schema, and the server validates it again, so a bad answer becomes a clear error instead of a crash."

## Phase 3: Job workspace

**Goal:** paste a job posting and get its requirements, pay, schedule and required documents, a match score with evidence for every requirement, a sorted gap list, a tracker row, and interview prep. This phase also builds the guardrail that Phase 4 relies on.

### Build

1. **Tables and migration:** `jobs`, `job_events`, `requirements`, `requirement_evidence`, `interview_preps`.
2. **Jobs and tracker**
   - `POST /jobs` saves the pasted posting text and an optional link. The app doesn't scrape job sites, because many block it; pasting always works.
   - Tracker page: title, department, pay, hours, match score, status, date applied, deadline, and the files used. Filter by status, sort by score or deadline.
   - Every status change writes a `job_events` row. Moving to "applied" fills in the date applied if it's empty.
3. **Posting analyzer:** `POST /jobs/:id/analysis` starts a task where the smart model pulls out title, organization, department, pay, hours and schedule, location, deadline, required and preferred qualifications, the documents to submit (transcript, writing sample, typing test, references), and the posting's key terms.
4. **Matching:** a second AI step gets each requirement and the user's facts (with IDs) and proposes, per requirement, a credit (full, partial or none), the evidence fact IDs, one line of reasoning, and a gap type for anything below full.
5. **Score in code** (`domain/matchScore.ts`)
   - Required qualifications weigh 2, preferred weigh 1. Documents and schedule items are shown as a checklist, not scored.
   - Full credit = 1, partial = 0.5, none = 0.
   - Credit above 0 needs at least one evidence fact that is confirmed and belongs to this user. Otherwise the credit drops to 0, the requirement shows "could count if you confirm this fact", and that fact moves to the front of the confirmation queue.
   - The score is rounded to a whole number. A required-only score is shown next to it. A posting with no scorable requirements shows no score and says why.
6. **Gaps:** every requirement below full credit, split into "Learn this before the interview" and "Can't fix quickly" (a degree, years of experience). One click adds a gap to the learning list.
7. **Re-scoring:** when a fact is confirmed, `POST /jobs/:id/match/refresh` re-runs the score math. If only statuses changed, no AI call is needed, so it's instant and free. A new AI matching pass runs only when new facts were added.
8. **Guardrail** (`domain/guardrail.ts`): rules 1 to 5 from the Architecture section, as pure functions that return a list of problems per line.
9. **Job page tabs:** Overview (pay, schedule, deadline, documents checklist), Match (each requirement with a credit badge, linked evidence and reasoning), Gaps, Documents (filled in Phase 4), Interview prep.
10. **Interview prep:** 5 to 7 likely questions (behavioral ones from the requirements, role-specific ones, and one about a gap) with sample answers in situation, task, action, result form, built only from confirmed facts and checked by the guardrail. The gap answer is honest about what the user hasn't done yet and names what they are learning.

The score formula, where w is the weight and c the credit of each scored requirement:

```latex
\text{score} = \mathrm{round}\left(100 \cdot \frac{\sum_i w_i c_i}{\sum_i w_i}\right)
```

Worked example for a test: 4 required (full, full, partial, none) and 2 preferred (full, none) give (2 × 2.5 + 1 × 1) ÷ (2 × 4 + 1 × 2) = 6 ÷ 10, a score of 60. The required-only score is 2.5 ÷ 4, shown as 63.

### Tests

- Match score: all full gives 100, all none gives 0, the worked example gives 60 and 63, half-point rounding, no requirements gives no score.
- Credit is dropped to 0 when the only evidence is unconfirmed, marked false, or belongs to another user.
- Analyzer: a fictional student-job posting fixture saves the right required and preferred items, pay, schedule and documents.
- Tracker: a status change writes an event, "applied" sets the date, bad filter values return 400.
- Guardrail, each rule with passing and failing lines:
  - "350+ calls" fails when the fact says "300+".
  - A skill named under a job with no linked fact from that job fails.
  - The false skill "R" must not match the word "React" (whole-word matching).
- Interview prep: every sample answer passes the guardrail.

### Done when

- [ ] A pasted real posting shows pay, schedule, documents to submit, and every requirement with credit and evidence
- [ ] Confirming a fact raises the score with no new AI call
- [ ] The tracker lists every job with status, score and date applied, and each job shows its status timeline
- [ ] Interview answers cite only confirmed facts
- [ ] Every rule in the score and the guardrail has a test, and `npm test` passes

### Say it in an interview

"The AI judges which facts prove a requirement, but the score itself is a pure function I unit-tested. That makes it explainable, repeatable, and impossible to inflate with unconfirmed facts. Re-scoring after a user confirms something costs nothing, because no AI call is needed."

## Phase 4: AI-written resume and cover letter

**Goal:** the user picks a job (or no job, for a general resume) and gets the best one-page resume and a cover letter in their own voice, built only from confirmed facts, downloadable as .docx and PDF. They can also upload any document for review.

### Build

1. **Tables and migration:** `documents`, `style_profiles`, `reviews`.
2. **Resume generation** (`POST /documents`)
   - Input to the smart model: the user's confirmed facts with IDs, the job's requirements and key terms, and the match results.
   - The model chooses, orders and rewords bullets, using the posting's own words where they are true, and ranks every bullet by importance. Each bullet carries its fact IDs.
   - Titles, organizations, locations and dates are filled in by code from the database (guardrail rule 6).
   - If the model asks for a fact that isn't confirmed, the task ends with 422 `needs_confirmation` and the questions to answer. After answering, the user generates again.
   - With no job selected, the same pipeline writes a general resume for a target role the user types in.
3. **Check and repair:** every bullet goes through the guardrail. Failing lines get one repair attempt with the reason, then are dropped. The check report is saved with the document and shown next to it.
4. **One-page fit** (`domain/pageFit.ts`): the PDF is rendered and its pages counted. If it runs over one page, the lowest-ranked bullets are removed one at a time, then the font steps down from 11 to 10.5 to 10 pt, then margins down to 0.5 inch. If it still doesn't fit, the report says so.
5. **Exports**
   - The Classic template is your current layout: Times New Roman, centered name, section headings with a line above, bold title and date on one line, italic organization and location on the next, bullet points.
   - `exporters/pdf.ts` uses pdfkit and `exporters/docx.ts` uses docx. Both read the same layout numbers from `templates/classic.ts`, so the two files match as closely as possible.
   - Known limit to be honest about: the page count is measured on the PDF. Word can wrap lines slightly differently, so the .docx gets a small safety margin.
6. **Versions:** every generation and every manual edit saves a new version for that job. The job page lists them, and the tracker links the one used to apply.
7. **Document page:** a preview with each bullet's evidence on hover, the check report, edit in place (edits are re-checked on save), and Download .docx and Download PDF buttons.
8. **Cover letters in the user's voice**
   - `POST /style-profile` reads the user's past letters and saves traits (sentence length, tone, how they open and close) and their signature phrases word for word.
   - Generation keeps those phrases, fixes only clear grammar mistakes, and cites fact IDs for every claim. Users with no past letters answer three short questions instead.
   - `domain/aiTells.ts` is a linter in plain code: em dashes, a list of stock phrases, and inflated words such as "expert" or "world-class" with no fact behind them. Hits are sent back for one rewrite and shown in the report.
9. **Review mode** (`POST /reviews`): upload any resume or letter and get line-by-line suggestions, a check of every claim against the fact bank ("not in your fact bank" where nothing matches), the page count, and mismatches in dates and numbers against the fact bank and other saved versions.

### Tests

- Guardrail rule 6: the rendered title, organization and dates always equal the database values.
- Generation with the fake AI: a bullet citing an unconfirmed fact is repaired or dropped, and the report lists it.
- Page fit: a fixture that is too long drops the lowest-ranked bullets first and ends at exactly one page; an impossible one reports failure.
- Exports: the PDF has one page and contains the name and section headings; the .docx opens and contains the same bullets in the same order.
- AI-tells linter: catches an em dash and each stock phrase, and passes the user's own signature phrases.
- Review: "250 calls" is flagged when the fact bank says "300+"; an end date that differs from the experience record is flagged.
- Versions: a manual edit creates version 2 and keeps version 1.

### Done when

- [ ] For one of your real postings, the app produces a one-page resume in your layout as .docx and PDF
- [ ] Every bullet shows the confirmed facts behind it, and nothing false or unconfirmed appears
- [ ] A cover letter keeps your own phrases and contains no em dashes or stock phrases
- [ ] Review mode flags a claim you deliberately changed in an uploaded resume
- [ ] Each job keeps all its versions, and `npm test` passes

### Say it in an interview

"The prompt asks the model to stay truthful, but I don't rely on that. Each generated line cites fact IDs, and pure functions check ownership, confirmation, numbers and skills before anything is shown. The model never writes dates or job titles at all; code prints those from the database."

## Phase 5: Public launch

**Goal:** beReady is online at a public address, safe for strangers to use, cheap to run, and easy for a recruiter to try in one click. Nothing in this phase is deployed until you say go.

### Build

1. **AI cost control**
   - Daily limit per user from `AI_DAILY_LIMIT` (20), with 5 for demo accounts. Settings shows "7 of 20 used today".
   - A monthly budget from `AI_MONTHLY_BUDGET_USD`: the sum of `est_cost_usd` in `ai_usage` is checked before each AI task, and when it's reached, AI endpoints return 503 `ai_paused` with a friendly message.
   - Also set a spend limit in the Anthropic Console as a second safety net.
2. **Demo mode:** `POST /demo` creates a temporary account seeded with a fictional student, a filled fact bank and two sample postings. A cleanup job deletes demo accounts after 24 hours.
3. **Account safety and privacy**
   - Password reset by emailed link: single-use token, stored hashed, expires in 30 minutes.
   - `GET /me/export` downloads everything as JSON. `DELETE /me` asks for the password, then removes the account and every row.
   - A plain-language privacy page: what is stored, that uploaded files are not kept, and that text is sent to Anthropic's API to be processed.
4. **Security pass**
   - Rate limits on every route, tighter on auth and uploads.
   - Cookies set to Secure, a strict Content-Security-Policy through helmet, and the Origin check on unsafe methods.
   - Logs redact passwords, cookies, resume text and posting text.
   - `npm audit` in CI, and a written checklist in `docs/SECURITY.md`.
5. **Production build**
   - Express serves `client/dist` and falls back to `index.html` for client routes.
   - A multi-stage Dockerfile: build client and server, then a small runtime image running as a non-root user.
    - Migrations run as a deploy step. `DATABASE_URL` is the Neon connection string.
6. **CI and deploy**
   - GitHub Actions on every push: install, lint, typecheck, test, build.
    - Vercel deploys `main` only after CI is green, with `/api/v1/health` checked after each deploy.
    - Secrets live in Vercel's environment variables, never in the repo.
    - To check before starting this phase: Vercel's current limits for how long a function may run, and Neon's free-plan limits. Rate-limit counters move from server memory to the database, because serverless functions do not share memory.
7. **Quality and docs**
   - One Playwright test of the whole journey: sign up, add a fact, paste a posting, generate a resume, download the PDF (with the fake AI).
   - OpenAPI generated from the Zod schemas and shown at `/api/docs`.
   - Loading, empty and error states on every page, and a mobile-friendly layout.
   - README with a live link, screenshots, the architecture diagram, how to run it, and a "Decisions and trade-offs" section linking the decision records.

### Tests

- Budget: when usage reaches the cap, AI endpoints return 503 and other endpoints still work.
- Demo: a demo account gets the limit of 5, and the cleanup removes expired ones with all their rows.
- Reset: a token works once, fails after expiry, and the request endpoint answers the same for known and unknown emails.
- Delete: after `DELETE /me`, no row with that `user_id` remains in any table.
- The Playwright journey passes in CI.

### Done when

- [ ] A friend can open the public link on their phone, sign up, and download a tailored resume
- [ ] "Try the demo" works in one click with no signup
- [ ] A push to `main` with a failing test does not deploy
- [ ] You have restored the Neon database to an earlier point once, to prove recovery works
- [ ] The README has the live link, screenshots and the API docs link

### Say it in an interview

"Opening an AI app to the public means anyone can spend my money, so every AI call is counted per user, there's a daily limit, and a monthly budget switch pauses AI without taking the site down. I ship through CI, and a failing test blocks the deploy."

## Interview talking points

These are the five problems worth telling as stories. Each has a file you can open and explain line by line.

| Problem | What you did | Where it lives |
| --- | --- | --- |
| AI makes things up | Every generated line cites fact IDs; pure functions check ownership, confirmation, numbers and skills; code prints titles and dates | `server/src/domain/guardrail.ts` and its tests |
| A score nobody can explain | The AI proposes evidence, a tested formula computes the score, and unconfirmed evidence earns zero | `server/src/domain/matchScore.ts` |
| AI calls are slow | 202 Accepted, a task resource, polling, and idempotency keys against double clicks | `server/src/tasks/`, `docs/API.md` |
| Many users, private data | Every query is scoped by user, other people's IDs return 404, and tests prove it for every resource | `server/src/db/`, ownership tests |
| Strangers spending your money | Per-user daily limits, usage tracking per call, and a monthly budget switch | `server/src/middleware/aiQuota.ts` |

Questions to be ready for:

- **Why Postgres, and why embedded in development?** Production is Neon, so one SQL dialect everywhere avoids bugs that only show up after deploying. PGlite keeps local setup at zero. The project started on SQLite and was switched on day one, while it was two tables; that is a good story about changing a decision early.
- **Why sessions and not JWTs?** Instant logout and revocation, and nothing readable by JavaScript.
- **How do you test AI features?** The AI sits behind one interface. Tests use a fake with fixtures, so they are free and repeatable, and the logic that matters is in pure functions.
- **What would you do next?** Streaming responses, a dedicated job queue for AI work, more resume templates.
- **What went wrong?** Keep a short `docs/JOURNAL.md` as you build. Real bugs you hit and fixed are the best interview answers, and only you can write those.
