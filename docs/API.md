# beReady REST API

The contract between the React client and the Express server. This file was written before the
routes. When the design changes, this file changes first, then `shared/src/index.ts`, then the code.

**Status of each endpoint:** `Built` means it exists and has tests. `Designed` means the contract is
agreed and it is built in the phase shown.

## Contents

1. [Conventions](#conventions)
2. [Errors](#errors)
3. [Long-running AI work](#long-running-ai-work)
4. [Health](#health) · [Auth](#auth) · [Me](#me) (Phase 1, built)
5. [Tasks and usage](#tasks-and-usage) · [Experiences](#experiences) · [Facts](#facts) · [Skills](#skills) · [Imports](#imports) · [GitHub](#github) · [Confirmations](#confirmations) · [Learning items](#learning-items) (Phase 2)
6. [Jobs](#jobs) · [Match](#match) · [Interview prep](#interview-prep) (Phase 3)
7. [Documents](#documents) · [Style profile](#style-profile) · [Reviews](#reviews) (Phase 4)
8. [Demo, password reset, export, delete](#launch-endpoints) (Phase 5)

## Conventions

| Topic | Rule |
| --- | --- |
| Base path | `/api/v1` |
| Format | JSON in and out. Exceptions: file uploads use `multipart/form-data`; exports return a file. |
| Field names | camelCase |
| Dates | ISO 8601 strings in UTC, for example `2026-11-09T22:30:00.000Z`. Calendar dates are `YYYY-MM-DD`. |
| IDs | Random strings with a type prefix: `usr_`, `exp_`, `fct_`, `skl_`, `imp_`, `job_`, `req_`, `doc_`, `rev_`, `tsk_`, `lrn_`. Never guessable, never reused. |
| Auth | A session cookie named `sid` (httpOnly, SameSite=Lax, Secure in production). Every endpoint needs it unless marked **Public**. |
| Cross-site protection | On POST, PATCH and DELETE, a browser `Origin` header must match the server's own address or `APP_ORIGIN`. Otherwise `403 bad_origin`. |
| Ownership | Every resource belongs to one user. Asking for someone else's resource returns `404 not_found`, never 403, so IDs cannot be probed. |
| Success codes | `200` OK · `201` Created (with a `Location` header) · `202` Accepted (AI work started) · `204` No Content |
| Lists | `?limit=20&offset=0` (limit 1 to 100). Response: `{ "data": [...], "page": { "limit": 20, "offset": 0, "total": 57 } }` |
| Sorting | `?sort=field` ascending, `?sort=-field` descending |
| Request ID | Every response has an `X-Request-Id` header. Errors repeat it as `requestId`. |
| Idempotency | Endpoints that start AI work accept an `Idempotency-Key` header. The same key from the same user within 24 hours returns the first task again. |

## Errors

Every error is an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details object with
`Content-Type: application/problem+json`.

```json
{
  "type": "/errors/validation-failed",
  "title": "Request is invalid",
  "status": 400,
  "code": "validation_failed",
  "detail": "2 fields are invalid.",
  "errors": [
    { "path": "email", "message": "Must be a valid email" },
    { "path": "password", "message": "Must be at least 10 characters" }
  ],
  "requestId": "req_7Hk2mQ9xLp0aBc3d"
}
```

| Field | Meaning |
| --- | --- |
| `type` | A stable path that names the kind of error |
| `title` | Short human-readable summary, the same for every error of this kind |
| `status` | The HTTP status code |
| `code` | Machine-readable code. Clients switch on this, not on `title`. |
| `detail` | What went wrong this time (optional) |
| `errors` | Per-field problems, `path` is the field name (only on validation errors) |
| `requestId` | Matches the `X-Request-Id` header and the server log line |

| Status | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed` | Body, query or path params fail the schema, or the body is not valid JSON |
| 401 | `not_authenticated` | No session cookie, or the session expired |
| 401 | `invalid_credentials` | Wrong email or password. The message never says which. |
| 403 | `bad_origin` | A data-changing request came from another website |
| 404 | `not_found` | The resource does not exist or belongs to someone else |
| 409 | `email_taken` | Signup with an email that already has an account |
| 409 | `already_exists` | Duplicate of a unique thing, such as a skill name |
| 413 | `file_too_large` | Upload over 5 MB, or JSON body over 1 MB |
| 415 | `unsupported_file_type` | Upload is not a real PDF or .docx (checked by file signature) |
| 422 | `no_text_found` | The file has no extractable text, for example a scanned PDF |
| 422 | `job_not_analyzed` | Asked for a match or documents before the posting was analyzed |
| 422 | `needs_confirmation` | Generation needs facts the user has not confirmed yet |
| 429 | `rate_limited` | Too many requests. Has a `Retry-After` header in seconds. |
| 429 | `ai_daily_limit` | The user's daily AI actions are used up. Has `Retry-After`. |
| 500 | `internal_error` | Unexpected server error. Details are in the server log only. |
| 502 | `ai_bad_response` | Claude failed or answered in the wrong shape, after one retry |
| 502 | `github_unavailable` | GitHub failed or rate-limited the server |
| 503 | `ai_paused` | The monthly AI budget is reached. Non-AI endpoints keep working. |

## Long-running AI work

AI calls can take many seconds, so endpoints that use AI do not wait. They answer at once:

```http
HTTP/1.1 202 Accepted
Location: /api/v1/tasks/tsk_Qm3x9LpA72bd
Content-Type: application/json

{ "taskId": "tsk_Qm3x9LpA72bd", "status": "queued" }
```

The client then polls `GET /tasks/:id` every 2 seconds until `status` is `succeeded` or `failed`.
A succeeded task names the resource it produced in `result`.

---

# Phase 1 (built)

## Health

### GET /health

**Public.** Confirms the server is running and can reach the database. Used by the host's health check.

Response `200`:

```json
{ "status": "ok", "database": "ok", "uptimeSeconds": 4211 }
```

```bash
curl http://localhost:3001/api/v1/health
```

## Auth

The `User` object returned by these endpoints:

```json
{
  "id": "usr_9fKq2LmX81aZpQ4r",
  "email": "alex.rivera@example.com",
  "name": "Alex Rivera",
  "isDemo": false,
  "createdAt": "2026-11-09T22:30:00.000Z"
}
```

The password hash is never part of any response.

### POST /auth/signup

**Public.** Creates an account and logs the user in.

Request body:

| Field | Type | Rules |
| --- | --- | --- |
| `email` | string | Valid email, at most 254 characters. Trimmed and lowercased before saving. |
| `password` | string | 10 to 200 characters |
| `name` | string | 1 to 100 characters, trimmed |

Response `201` with `Location: /api/v1/me`, a `Set-Cookie: sid=...` header and the `User` object.

Errors: `400 validation_failed` · `403 bad_origin` · `409 email_taken` · `429 rate_limited` (more than 10 signups per hour from one IP)

```bash
curl -i -c cookies.txt -X POST http://localhost:3001/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"alex.rivera@example.com","password":"correct-horse-battery","name":"Alex Rivera"}'
```

### POST /auth/login

**Public.** Starts a session.

Request body:

| Field | Type | Rules |
| --- | --- | --- |
| `email` | string | Valid email |
| `password` | string | 1 to 200 characters |

Response `200` with a `Set-Cookie: sid=...` header and the `User` object.

Errors: `400 validation_failed` · `401 invalid_credentials` (same answer for a wrong password and an
unknown email) · `403 bad_origin` · `429 rate_limited` (more than 5 tries per minute for one IP and email)

```bash
curl -i -c cookies.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alex.rivera@example.com","password":"correct-horse-battery"}'
```

### POST /auth/logout

**Public** (works with or without a session). Deletes the session on the server and clears the cookie.

Response `204`, no body.

```bash
curl -i -b cookies.txt -X POST http://localhost:3001/api/v1/auth/logout
```

## Me

### GET /me

Returns the logged-in user. The client calls this on page load to learn whether anyone is logged in.

Response `200`: the `User` object. Errors: `401 not_authenticated`

```bash
curl -b cookies.txt http://localhost:3001/api/v1/me
```

### PATCH /me

Changes the name, the password, or both. Send at least one of `name` and `newPassword`.

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string, optional | 1 to 100 characters |
| `currentPassword` | string | Required when `newPassword` is sent |
| `newPassword` | string, optional | 10 to 200 characters |

Changing the password deletes every session of this user (all devices are logged out) and sets a
new `sid` cookie on this response, so the current device stays logged in.

Response `200`: the updated `User` object.

Errors: `400 validation_failed` (including a wrong `currentPassword`, reported on that field) ·
`401 not_authenticated` · `403 bad_origin`

```bash
curl -b cookies.txt -X PATCH http://localhost:3001/api/v1/me \
  -H 'Content-Type: application/json' -d '{"name":"Alex R."}'
```

---

# Phase 2 (designed): fact bank

Every endpoint below needs a session. All can return `401 not_authenticated`; all that take an `:id`
can return `404 not_found`; all that take a body can return `400 validation_failed` and `403 bad_origin`.
Only the additional errors are listed per endpoint.

## Tasks and usage

### GET /tasks/:id

Status of one piece of AI work.

```json
{
  "id": "tsk_Qm3x9LpA72bd",
  "type": "import_extract",
  "status": "succeeded",
  "result": { "resource": "import", "id": "imp_81nZq0LkT5sW", "href": "/api/v1/imports/imp_81nZq0LkT5sW" },
  "error": null,
  "createdAt": "2026-11-10T05:00:00.000Z",
  "finishedAt": "2026-11-10T05:00:14.000Z"
}
```

`type` is one of `import_extract`, `github_import`, `job_analysis`, `match_refresh`, `interview_prep`,
`document_generate`, `style_profile`, `review`. `status` is `queued`, `running`, `succeeded` or `failed`.
When failed, `error` is a problem details object and `result` is null.

### GET /me/usage

```json
{ "aiActionsToday": 7, "aiDailyLimit": 20, "resetsAt": "2026-11-11T00:00:00.000Z" }
```

## Experiences

A job, a degree, a project, volunteer work or a leadership role.

```json
{
  "id": "exp_4tGh8KlM2nPq",
  "kind": "work",
  "title": "Technical Intern",
  "organization": "Example Corp",
  "location": "Rexburg, ID",
  "startDate": "2026-01-01",
  "endDate": null,
  "isCurrent": true,
  "url": null,
  "sortOrder": 0,
  "source": { "id": "src_7yUi3OpL9kJh", "kind": "pdf", "label": "resume-2026.pdf" },
  "factCounts": { "confirmed": 4, "needsConfirmation": 1, "false": 0 }
}
```

`kind`: `work`, `education`, `project`, `volunteer`, `leadership`.

| Method and path | Request | Response | Extra errors |
| --- | --- | --- | --- |
| `GET /experiences` | Query: `kind`, `limit`, `offset`, `sort` (default `sortOrder`) | `200` list of experiences | |
| `POST /experiences` | `kind`, `title` (required); `organization`, `location`, `startDate`, `endDate`, `isCurrent`, `url` | `201` the experience, `Location` header | |
| `GET /experiences/:id` | | `200` the experience plus `facts: Fact[]` | |
| `PATCH /experiences/:id` | Any of the POST fields, plus `sortOrder` | `200` the experience | |
| `DELETE /experiences/:id` | | `204`. Its facts are deleted too. | |

Rule: `endDate` must not be before `startDate`, and `isCurrent: true` requires `endDate: null`.

## Facts

One provable statement. The unit everything else is built from.

```json
{
  "id": "fct_2wEr5TyU8iOp",
  "experienceId": "exp_4tGh8KlM2nPq",
  "kind": "achievement",
  "text": "Resolved 300+ faculty support calls and emails across Canvas and Zoom",
  "status": "confirmed",
  "skillIds": ["skl_9aSd1FgH4jKl"],
  "source": { "id": "src_7yUi3OpL9kJh", "kind": "pdf", "label": "resume-2026.pdf" },
  "confirmedAt": "2026-11-10T05:10:00.000Z",
  "updatedAt": "2026-11-10T05:10:00.000Z"
}
```

`kind`: `achievement`, `responsibility`, `award`, `education_detail`, `language`, `other`.
`status`: `confirmed`, `needs_confirmation`, `false`. Only `confirmed` facts may appear in any generated text.

| Method and path | Request | Response | Extra errors |
| --- | --- | --- | --- |
| `GET /facts` | Query: `status`, `experienceId`, `kind`, `q` (text search), `limit`, `offset`, `sort` (default `-updatedAt`) | `200` list of facts | |
| `POST /facts` | `text` (required, 1 to 500 characters); `experienceId`, `kind`, `skillIds`. Saved as `confirmed` with source `typed`. | `201` the fact | `404` if `experienceId` or a skill is not the user's |
| `PATCH /facts/:id` | Any of `text`, `kind`, `status`, `experienceId`, `skillIds`. Editing the text of a confirmed fact keeps it confirmed, because the user typed it. | `200` the fact | |
| `DELETE /facts/:id` | | `204` | |

## Skills

```json
{ "id": "skl_9aSd1FgH4jKl", "name": "TypeScript", "category": "language", "status": "confirmed", "usedIn": ["exp_4tGh8KlM2nPq"] }
```

`category`: `language`, `framework`, `tool`, `spoken_language`, `soft`, `other`. `usedIn` is worked out
from the facts linked to the skill; it is how the app knows where a skill was really used.

| Method and path | Request | Response | Extra errors |
| --- | --- | --- | --- |
| `GET /skills` | Query: `status`, `category`, `limit`, `offset` | `200` list of skills | |
| `POST /skills` | `name` (required, 1 to 60 characters), `category`, `status` (default `confirmed`) | `201` the skill | `409 already_exists` (names are unique per user, ignoring case) |
| `PATCH /skills/:id` | `name`, `category`, `status` | `200` the skill | `409 already_exists` |
| `DELETE /skills/:id` | | `204` | |

## Imports

Turning a resume, cover letter or any pasted text into proposed experiences, facts and skills.

### POST /imports

Either JSON `{ "text": "...", "label": "My resume" }` (text 20 to 50,000 characters) or
`multipart/form-data` with one `file` field (PDF or .docx, at most 5 MB). The file is parsed in
memory and not kept. Accepts `Idempotency-Key`.

Response `202` with a task (see [Long-running AI work](#long-running-ai-work)).

Errors: `413 file_too_large` · `415 unsupported_file_type` · `422 no_text_found` · `429 ai_daily_limit` · `503 ai_paused`

### GET /imports/:id

```json
{
  "id": "imp_81nZq0LkT5sW",
  "status": "ready",
  "source": { "id": "src_7yUi3OpL9kJh", "kind": "pdf", "label": "resume-2026.pdf" },
  "proposals": {
    "experiences": [
      {
        "ref": "e1",
        "kind": "work",
        "title": "Technical Intern",
        "organization": "Example Corp",
        "startDate": "2026-01-01",
        "endDate": null,
        "isCurrent": true,
        "matchesExperienceId": null
      }
    ],
    "facts": [
      {
        "ref": "f1",
        "experienceRef": "e1",
        "kind": "achievement",
        "text": "Built sections of a landing page in React",
        "skillNames": ["React", "JavaScript"],
        "possibleDuplicateOf": null
      }
    ],
    "skills": [{ "ref": "s1", "name": "React", "category": "framework" }]
  }
}
```

`status`: `processing`, `ready`, `committed`, `failed`. `possibleDuplicateOf` holds the ID of an
existing fact when the texts overlap by more than 80%.

### POST /imports/:id/commit

Saves what the user decided on the review screen. Anything not listed is discarded.

```json
{
  "experiences": [{ "ref": "e1", "title": "Technical Intern" }],
  "facts": [
    { "ref": "f1", "status": "confirmed" },
    { "ref": "f2", "status": "needs_confirmation", "text": "Edited wording" }
  ],
  "skills": [{ "ref": "s1", "status": "confirmed" }]
}
```

Response `201`: `{ "created": { "experiences": 1, "facts": 2, "skills": 1 } }`

Errors: `409 already_exists` when the import was already committed.

## GitHub

### GET /github/repos?username=octocat

Public repos of any GitHub user, newest push first. Forks are left out unless `includeForks=true`.

```json
{
  "data": [
    {
      "name": "study-tracker",
      "description": "Track study sessions",
      "language": "TypeScript",
      "stars": 3,
      "pushedAt": "2026-10-20T18:00:00Z",
      "url": "https://github.com/octocat/study-tracker"
    }
  ]
}
```

Errors: `404 not_found` (no such GitHub user) · `502 github_unavailable`

### POST /imports/github

`{ "username": "octocat", "repos": ["study-tracker", "task-manager"] }` (1 to 10 repos). Fetches each
repo's description, languages, topics and README, then proposes one project experience and 2 to 4
facts per repo. Accepts `Idempotency-Key`.

Response `202` with a task. The result is an import, reviewed and committed like any other.

Errors: `429 ai_daily_limit` · `502 github_unavailable` · `503 ai_paused`

## Confirmations

One question at a time for facts that are not confirmed yet.

### GET /confirmations/next

Response `200`:

```json
{
  "fact": { "id": "fct_2wEr5TyU8iOp", "text": "Used Python to clean survey data", "status": "needs_confirmation" },
  "experience": { "id": "exp_4tGh8KlM2nPq", "title": "Technical Intern", "organization": "Example Corp" },
  "sourceSnippet": "...worked with Python scripts to clean...",
  "neededByJobIds": ["job_5bNm7VcX3zLk"],
  "remaining": 6
}
```

Response `204` when nothing is waiting. Facts that a saved job needs come first.

### POST /confirmations/:factId

`{ "answer": "true" | "false" | "learn", "text": "optional corrected wording" }`

| Answer | Effect |
| --- | --- |
| `true` | Fact becomes `confirmed` (with the corrected text, if sent) |
| `false` | Fact becomes `false` and can never be used |
| `learn` | Fact stays unusable and a learning item is created for it |

Response `200`: `{ "fact": Fact, "learningItem": LearningItem | null }`

## Learning items

```json
{ "id": "lrn_3cVb6NmQ1wEr", "topic": "Excel pivot tables", "reason": "Asked for in Office Assistant posting", "jobId": "job_5bNm7VcX3zLk", "factId": null, "status": "todo" }
```

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /learning-items` | Query: `status` (`todo`, `learning`, `done`) | `200` list |
| `PATCH /learning-items/:id` | `status`, `topic` | `200` the item. When set to `done` and it has a `factId`, the response adds `"confirmFactId"` so the client can ask the user to confirm that fact. |
| `DELETE /learning-items/:id` | | `204` |

---

# Phase 3 (designed): job workspace

## Jobs

```json
{
  "id": "job_5bNm7VcX3zLk",
  "title": "Office Assistant",
  "organization": "Example University",
  "department": "Admissions",
  "location": "Rexburg, ID",
  "url": "https://example.edu/jobs/123",
  "pay": "$13.50 per hour",
  "hours": "15 to 20 hours per week",
  "deadline": "2026-11-30",
  "documentsToSubmit": ["Resume", "Cover letter", "Unofficial transcript"],
  "status": "not_applied",
  "dateApplied": null,
  "matchScore": 60,
  "requiredScore": 63,
  "analyzed": true,
  "notes": "",
  "createdAt": "2026-11-10T06:00:00.000Z"
}
```

`status`: `not_applied`, `applied`, `interview`, `offer`, `rejected`.

| Method and path | Request | Response | Extra errors |
| --- | --- | --- | --- |
| `GET /jobs` | Query: `status`, `limit`, `offset`, `sort` (`-createdAt`, `-matchScore`, `deadline`) | `200` list of jobs | |
| `POST /jobs` | `postingText` (required, 50 to 30,000 characters); `title`, `url` | `201` the job, not analyzed yet | |
| `GET /jobs/:id` | | `200` the job plus `postingText` and `documents` (id, type, version) | |
| `PATCH /jobs/:id` | `status`, `dateApplied`, `notes`, `title`, `organization`, `department`, `pay`, `hours`, `deadline`, `url` | `200` the job. A status change writes an event; `applied` sets `dateApplied` to today if empty. | |
| `DELETE /jobs/:id` | | `204`. Requirements, events, prep and documents are deleted too. | |
| `GET /jobs/:id/events` | | `200` `{ "data": [{ "fromStatus": "not_applied", "toStatus": "applied", "createdAt": "..." }] }` | |

### POST /jobs/:id/analysis

Extracts requirements, pay, schedule and documents from the posting, then runs the match. Accepts
`Idempotency-Key`. Response `202` with a task.

Errors: `429 ai_daily_limit` · `503 ai_paused`

## Match

### GET /jobs/:id/match

```json
{
  "score": 60,
  "requiredScore": 63,
  "requirements": [
    {
      "id": "req_8xZc2VbN5mQw",
      "text": "Experience with Microsoft Excel",
      "kind": "required",
      "category": "skill",
      "credit": 0.5,
      "reasoning": "Used Excel to reconcile statements; no pivot tables yet.",
      "evidence": [{ "factId": "fct_2wEr5TyU8iOp", "text": "Reconciled card statements in Excel for 80+ people" }],
      "couldCountIfConfirmed": [],
      "gapType": "learn_before_interview"
    }
  ],
  "checklist": [{ "text": "Unofficial transcript", "category": "document" }]
}
```

How the score is computed, in code and not by the AI:

- Weight: `required` = 2, `preferred` = 1. `document` and `schedule` items are in `checklist` and not scored.
- Credit: full = 1, partial = 0.5, none = 0.
- Credit above 0 requires at least one evidence fact that is `confirmed` and owned by the user.
  Otherwise credit is 0 and the unconfirmed facts are listed in `couldCountIfConfirmed`.
- `score = round(100 × Σ(weight × credit) ÷ Σ(weight))`. `requiredScore` uses required items only.
- With no scorable requirements, `score` and `requiredScore` are `null`.

`gapType` (only when credit is below 1): `learn_before_interview` or `long_term`.

Errors: `422 job_not_analyzed`

### POST /jobs/:id/match/refresh

Re-scores after facts changed. If only fact statuses changed, the score is recomputed without AI and
the task succeeds immediately. If new facts exist, a new AI matching pass runs. Response `202` with a task.

Errors: `422 job_not_analyzed` · `429 ai_daily_limit` · `503 ai_paused`

## Interview prep

### POST /jobs/:id/interview-prep

Generates 5 to 7 likely questions with sample answers built only from confirmed facts.
Response `202` with a task. Errors: `422 job_not_analyzed` · `429 ai_daily_limit` · `503 ai_paused`

### GET /jobs/:id/interview-prep

```json
{
  "questions": [
    {
      "question": "Tell me about a time you handled many requests under a deadline.",
      "kind": "behavioral",
      "answer": "At the Faculty Technology Center I ...",
      "factIds": ["fct_2wEr5TyU8iOp"]
    }
  ],
  "createdAt": "2026-11-10T06:30:00.000Z"
}
```

`kind`: `behavioral`, `role_specific`, `gap`. Response `404` when none has been generated.

---

# Phase 4 (designed): documents

## Documents

A generated resume or cover letter. Each one is a saved version.

```json
{
  "id": "doc_6pLk9JhG3fDs",
  "type": "resume",
  "jobId": "job_5bNm7VcX3zLk",
  "version": 2,
  "template": "classic",
  "pageCount": 1,
  "content": {
    "header": { "name": "Alex Rivera", "contact": ["alex.rivera@example.com", "Rexburg, ID"] },
    "sections": [
      {
        "heading": "Experience",
        "entries": [
          {
            "experienceId": "exp_4tGh8KlM2nPq",
            "lines": [
              { "text": "Resolved 300+ faculty support calls across Canvas and Zoom", "factIds": ["fct_2wEr5TyU8iOp"], "rank": 1 }
            ]
          }
        ]
      }
    ]
  },
  "checkReport": {
    "passed": true,
    "dropped": [{ "text": "Led a team of 12", "rule": "number_not_in_fact" }],
    "pageFit": { "bulletsRemoved": 1, "fontSize": 11 },
    "aiTells": []
  },
  "model": "claude-sonnet-5-5",
  "promptVersion": "resume-v1",
  "createdAt": "2026-11-10T07:00:00.000Z"
}
```

Titles, organizations, locations and dates are not in `content`. They are read from the experience
at render time, so the AI can never change them. `rule` is one of `missing_fact_ids`,
`fact_not_confirmed`, `number_not_in_fact`, `skill_not_used_here`, `false_claim`.

| Method and path | Request | Response | Extra errors |
| --- | --- | --- | --- |
| `GET /templates` | | `200` `{ "data": [{ "id": "classic", "name": "Classic", "description": "Times New Roman, centered name, ruled headings" }] }` | |
| `POST /documents` | `type` (`resume` or `cover_letter`, required); `jobId` or `targetRole` (one is required); `template` (default `classic`). Accepts `Idempotency-Key`. | `202` with a task | `422 job_not_analyzed` · `422 needs_confirmation` (lists `factIds` to confirm) · `429 ai_daily_limit` · `503 ai_paused` |
| `GET /documents` | Query: `jobId`, `type`, `limit`, `offset` | `200` list (without `content`) | |
| `GET /documents/:id` | | `200` the document | |
| `PATCH /documents/:id` | `content` (the edited lines). The guardrail runs again and the result is saved as a new version. | `201` the new version | |
| `DELETE /documents/:id` | | `204` | |
| `GET /documents/:id/export?format=docx` or `pdf` | | `200` the file, with `Content-Disposition: attachment; filename="Alex-Rivera-Office-Assistant-resume.pdf"` | `400` for another format |

## Style profile

How the user writes, learned from their own past cover letters.

| Method and path | Request | Response | Extra errors |
| --- | --- | --- | --- |
| `GET /style-profile` | | `200` `{ "traits": { "sentenceLength": "short", "tone": "warm and direct" }, "signaturePhrases": ["A rule that I have for myself is ..."], "sampleSourceIds": ["src_..."], "updatedAt": "..." }` or `404` when none exists | |
| `POST /style-profile` | `{ "sourceIds": ["src_..."] }` (1 to 5 imported letters) or `{ "answers": ["...", "...", "..."] }` for users with no past letters | `202` with a task | `429 ai_daily_limit` · `503 ai_paused` |
| `PATCH /style-profile` | `signaturePhrases`, `traits` | `200` the profile | |

## Reviews

### POST /reviews

Upload any resume or letter (`multipart/form-data` with `file`, or JSON `{ "text": "..." }`).
Response `202` with a task.

Errors: `413 file_too_large` · `415 unsupported_file_type` · `422 no_text_found` · `429 ai_daily_limit` · `503 ai_paused`

### GET /reviews/:id

```json
{
  "id": "rev_1qAz2WsX3eDc",
  "pageCount": 2,
  "onePage": false,
  "lines": [
    {
      "text": "Resolved 250 support calls",
      "suggestion": "Your fact bank says 300+. Use the confirmed number.",
      "claim": { "status": "mismatch", "factId": "fct_2wEr5TyU8iOp" }
    }
  ],
  "mismatches": [{ "kind": "number", "inDocument": "250", "inFactBank": "300+", "factId": "fct_2wEr5TyU8iOp" }],
  "aiTells": [{ "text": "I am excited to leverage", "rule": "stock_phrase" }]
}
```

`claim.status`: `supported`, `mismatch`, `not_in_fact_bank`, `not_a_claim`.

---

# Phase 5 (designed): launch endpoints

<a id="launch-endpoints"></a>

| Method and path | Auth | Request | Response | Extra errors |
| --- | --- | --- | --- | --- |
| `POST /demo` | Public | none | `201` the demo `User` (`isDemo: true`) with a session cookie. The account holds sample data and is deleted after 24 hours. | `429 rate_limited` |
| `POST /auth/password-reset` | Public | `{ "email": "..." }` | Always `202`, whether or not the email has an account, so emails cannot be probed | `429 rate_limited` |
| `POST /auth/password-reset/confirm` | Public | `{ "token": "...", "newPassword": "..." }` | `204`. The token works once and expires after 30 minutes. All sessions are deleted. | `400 validation_failed` for a bad or expired token |
| `GET /me/export` | Session | none | `200` a JSON file with everything stored for this user | |
| `DELETE /me` | Session | `{ "password": "..." }` | `204`. Every row with this user's ID is removed and the cookie is cleared. | `400 validation_failed` for a wrong password |

In this phase the same Zod schemas also generate an OpenAPI file, served with Swagger UI at `/api/docs`.
