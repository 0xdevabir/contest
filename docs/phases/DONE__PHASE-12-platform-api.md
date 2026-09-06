# Phase 12 — Platform API, Imports & Federation

> **Execute with**: "execute Phase 12"
> **Effort**: 10–14 days · **Flag**: `platformApi`
> **Depends on**: Phase 2, 5 · **Unblocks**: third-party integration, bulk content

---

## Goal

Let power users and other systems work with the platform without the UI: a
versioned public REST API, scoped API keys, webhooks, embeddable widgets, bulk
problem import from standard package formats, and — carefully scoped — remote
judge adapters for problems hosted elsewhere.

## Why now

Content is the constraint on growth. A teacher with 200 problems in Polygon or a
department with an existing question bank will not retype them. One import path
is worth more than fifty hand-authored problems. The API also makes the platform
integrable with university systems (attendance, LMS, registrar) without building
each integration ourselves.

## Scope

- `/api/v1/**` — versioned, documented, key-authenticated
- `ApiKey` with scopes, rate limits, rotation and revocation
- Webhooks with HMAC signing and retries
- Polygon package import (`.zip` with `problem.xml`)
- Generic package import (statement + `tests/` directory)
- vJudge-style CSV/JSON bulk problem import
- Embeddable widgets (solve-count badge, contest countdown)
- Remote judge adapters — Codeforces, and the framework for others

---

## Design decisions

### D1 — `/api/v1` is separate from the internal routes

The existing `/api/**` routes serve the web app and are free to change with it.
`/api/v1/**` is a contract: additive changes only, deprecation with notice, and
a version bump for anything breaking. Mixing them means either the web app is
frozen or third parties break weekly.

Shape: REST, JSON, cursor pagination, `snake_case` field names (the convention
third-party consumers expect), ISO-8601 timestamps with timezone, and a
consistent envelope:

```jsonc
{ "data": [...], "pagination": { "next_cursor": "...", "has_more": true } }
{ "error": { "code": "FORBIDDEN", "message": "...", "details": {...} } }
```

Error codes reuse the Phase 0 `AppError` codes so internal and public errors
never diverge.

### D2 — Scoped keys, not a single "API key"

```
problems:read   problems:write
contests:read   contests:write
standings:read
submissions:read  submissions:write   (submit on behalf of the key owner)
sections:read     sections:write
users:read        (limited: public profile fields only)
```

A key is created with a subset, shown **once**, stored hashed (SHA-256 — not
bcrypt: these are high-entropy random tokens verified on every request, so a slow
hash is a self-inflicted DoS). Prefix `chk_live_` / `chk_test_` so a leaked key
is identifiable in logs and by secret scanners.

Per-key rate limits, default 60 req/min, configurable per key by an admin. Keys
inherit their owner's permissions and can never exceed them — a teacher's key
cannot read another teacher's sections.

`users:read` returns only fields the profile privacy settings already expose.
The API must never become a way around `profilePublic`.

### D3 — Polygon import is the highest-value importer

Codeforces Polygon is the de facto standard for problem preparation, and problems
from ICPC regionals and national olympiads are distributed as Polygon packages.

A full package contains `problem.xml` (names, limits, checker, test metadata),
`statements/`, `tests/` (numbered inputs and `.a` answers), `files/` (checker,
validator, generators), and `solutions/` with expected verdicts.

Mapping to the Phase 2 model:

| Polygon | CodeHub |
|---|---|
| `problem.xml` → names/`time-limit`/`memory-limit` | `ProblemVersion` limits |
| `statements/.../problem.tex` or `problem-properties.json` | `statementMd` (LaTeX → Markdown; keep math verbatim) |
| `tests/NN`, `tests/NN.a` | `TestCase` in the appropriate `TestGroup` |
| `testset/groups` (if present) | `TestGroup` with points and `dependsOn` |
| `files/check.cpp` | `checkerType: SPECIAL`, `checkerCode` |
| `solutions/` with tags `main`, `accepted`, `time-limit-exceeded` | `ReferenceSolution` with `expectedVerdict` |

After import, run the Phase 2 publish gate — the imported reference solutions
must produce their declared verdicts. An import that does not validate stays a
draft with a clear report. This is what makes bulk import safe.

LaTeX → Markdown conversion is lossy in general; convert the common subset
(`\textbf`, `\it`, itemize, verbatim, `$...$`) and leave anything unrecognised as
raw LaTeX in a fenced block with a warning, rather than silently mangling it.

### D4 — Remote judging is scoped narrowly and honestly

vJudge's model — submitting to Codeforces on a user's behalf through scraped
sessions — is operationally fragile and legally grey. Do not replicate it
wholesale.

What ships:

- A **`RemoteProblem`** model: a problem *reference* with title, link, and
  attribution, usable in contests. Statements are **linked, never copied**.
- A **`JudgeAdapter`** interface with a Codeforces implementation using the
  official public API where it exists (`contest.standings`, `problemset.problems`)
  for metadata and standings mirroring.
- Actual remote *submission* is gated behind an explicit per-institution admin
  opt-in with a written acknowledgement of the target site's terms, and requires
  the user's own credentials on that site, stored encrypted and revocable. Off by
  default; documented as the user's responsibility.

Being honest about this in the plan is better than discovering the problem after
building it. The metadata/standings half is genuinely useful (a coach can mirror
a Codeforces Div. 3 round for their squad) and carries none of the risk.

---

## Schema

```prisma
model ApiKey {
  id         String    @id @default(cuid())
  userId     String
  name       String
  /// SHA-256 of the token. Only the prefix is stored in clear for display.
  keyHash    String    @unique
  keyPrefix  String                        // "chk_live_a1b2…"
  scopes     String[]
  rateLimit  Int       @default(60)
  lastUsedAt DateTime?
  expiresAt  DateTime?
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  webhooks Webhook[]

  @@index([userId, revokedAt])
}

model Webhook {
  id         String   @id @default(cuid())
  apiKeyId   String
  url        String
  events     String[]                      // contest.ended, submission.judged, …
  secret     String                        // HMAC-SHA256 signing key
  active     Boolean  @default(true)
  failCount  Int      @default(0)
  lastFailAt DateTime?
  createdAt  DateTime @default(now())

  apiKey     ApiKey            @relation(fields: [apiKeyId], references: [id], onDelete: Cascade)
  deliveries WebhookDelivery[]
}

model WebhookDelivery {
  id         String   @id @default(cuid())
  webhookId  String
  event      String
  payload    Json
  status     Int?
  attempt    Int      @default(1)
  error      String?
  deliveredAt DateTime?
  createdAt  DateTime @default(now())

  webhook Webhook @relation(fields: [webhookId], references: [id], onDelete: Cascade)
  @@index([webhookId, createdAt])
}

model ImportJob {
  id          String   @id @default(cuid())
  kind        String                        // "polygon" | "generic" | "csv"
  userId      String
  sourceKey   String                        // uploaded archive in blob storage
  status      String   @default("PENDING")  // PENDING | RUNNING | DONE | FAILED
  total       Int      @default(0)
  imported    Int      @default(0)
  failed      Int      @default(0)
  report      Json     @default("{}")
  createdAt   DateTime @default(now())
  finishedAt  DateTime?

  @@index([userId, createdAt])
}

model RemoteProblem {
  id           String  @id @default(cuid())
  provider     String                       // "codeforces" | "atcoder" | "spoj"
  externalId   String                       // "1234A"
  title        String
  url          String
  difficulty   Int?
  tags         String[] @default([])
  fetchedAt    DateTime @default(now())

  @@unique([provider, externalId])
}

model RemoteCredential {
  id          String   @id @default(cuid())
  userId      String
  provider    String
  handle      String
  /// AES-GCM encrypted with a server key; user-revocable.
  secretEnc   String
  verifiedAt  DateTime?
  createdAt   DateTime @default(now())

  @@unique([userId, provider])
}
```

Migration `0021_platform_api`: additive.

---

## API surface (v1)

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/api/v1/problems` | `problems:read` | Filter by tag, difficulty, author; cursor |
| `GET` | `/api/v1/problems/{slug}` | `problems:read` | Statement, samples, limits, tags |
| `POST` | `/api/v1/problems` | `problems:write` | Full problem with inline or referenced test data |
| `PUT` | `/api/v1/problems/{slug}/tests` | `problems:write` | Replace the test set |
| `GET` | `/api/v1/contests` | `contests:read` | Visibility-filtered by the key owner's access |
| `GET` | `/api/v1/contests/{id}/standings` | `standings:read` | Live or snapshot |
| `GET` | `/api/v1/contests/{id}/submissions` | `submissions:read` | Staff-scoped |
| `POST` | `/api/v1/submissions` | `submissions:write` | Submit as the key owner |
| `GET` | `/api/v1/submissions/{id}` | `submissions:read` | Verdict + report |
| `GET` | `/api/v1/sections/{id}/gradebook` | `sections:read` | Teacher's own sections |
| `GET` | `/api/v1/users/{handle}` | `users:read` | Public fields only |
| `GET` | `/api/v1/me` | any | Key owner + granted scopes |

Documentation: an OpenAPI 3.1 document generated from the zod schemas (via
`zod-to-openapi`) so the spec cannot drift from the implementation, served at
`/api/v1/openapi.json` with a Scalar or Stoplight viewer at `/developers`.

### Webhooks

Events: `contest.started`, `contest.ended`, `submission.judged`,
`assignment.due_soon`, `problem.published`, `rating.updated`.

Delivery: `POST` with `X-CodeHub-Signature: sha256=<hmac>` over the raw body
and `X-CodeHub-Timestamp` (reject deliveries older than 5 minutes on the
receiving end — document this). Retries at 1 s, 10 s, 1 m, 10 m, 1 h; after 5
consecutive failures the webhook is disabled and the owner notified.

### Embeds

`/embed/user/{handle}/badge.svg` — solve count and rating, cached 1 h,
theme parameter, no JavaScript. `/embed/contest/{id}/countdown.svg` similarly.
An SVG served with permissive CORS is the format that works in a GitHub README,
which is where students will actually put it.

---

## Importers

```
src/lib/import/
  polygon.ts    # problem.xml parsing, LaTeX→MD, tests, checker, solutions
  generic.ts    # a directory convention: statement.md + tests/*.in|.out + meta.json
  csv.ts        # bulk metadata-only import for an existing question bank
  latex.ts      # the LaTeX subset converter
  runner.ts     # queued ImportJob execution with per-item reporting
```

All importers funnel into the Phase 2 authoring API — never direct database
writes. That guarantees an imported problem is indistinguishable from a
hand-authored one and that validation cannot be bypassed.

Import jobs run on the queue with progress reporting and a per-item outcome
report downloadable as CSV. A 200-problem Polygon archive import must be
resumable and must not fail wholesale because problem 137 has a malformed
statement.

---

## Frontend surfaces

| Route | Content |
|---|---|
| `/developers` *(new)* | API docs (OpenAPI viewer), quickstart, examples in curl/JS/Python |
| `/profile/api-keys` *(new)* | Create with scope checkboxes, show once, rotate, revoke, usage stats |
| `/profile/webhooks` *(new)* | URL, events, secret, recent deliveries with replay |
| `/teacher/import` *(new)* | Upload a package, watch progress, review the per-item report, publish the successful ones |
| `/teacher/problems` | "Import package" button beside "New problem" |

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | Key hashing + prefix; a revoked key is rejected; scope enforcement per endpoint |
| Unit | Webhook signature generation and verification; timestamp replay rejected |
| Unit | Polygon `problem.xml` parsing across three real packages, including grouped testsets |
| Unit | LaTeX subset conversion; unknown macros preserved verbatim with a warning |
| Integration | A key without `problems:write` gets 403 on create |
| Integration | A key cannot exceed its owner's permissions (teacher key → other teacher's section = 403) |
| Integration | Import a real Polygon package → problem draft with tests, checker and references → publish gate passes |
| Integration | An import with one malformed problem imports the rest and reports the failure |
| Integration | Webhook retries on 500 and disables after 5 failures |
| Contract | OpenAPI document validates; every documented endpoint responds with the documented shape |

Collect three real Polygon packages (an ICPC regional problem, a national
olympiad problem, a simple one) before starting. Parsing "what the format says"
and parsing "what real packages contain" are different jobs.

---

## Acceptance criteria

1. A teacher creates a scoped API key, fetches their contest standings with
   `curl`, and revokes it.
2. A key cannot access anything its owner could not.
3. A 50-problem Polygon archive imports with a per-problem outcome report; valid
   problems pass the publish gate.
4. An import failure on one problem does not abort the batch.
5. A webhook fires on `contest.ended` with a verifiable HMAC signature and retries
   on failure.
6. The OpenAPI document is generated from the implementation and cannot drift.
7. A solve-count badge SVG renders in a GitHub README.
8. Remote problems can be referenced in a contest with attribution and a link;
   remote submission is off unless explicitly enabled per institution.

## Rollback

`platformApi` off returns 404 for `/api/v1/**` and hides the developer surfaces.
Keys and webhooks remain stored and inert.

## Risks

| Risk | Mitigation |
|---|---|
| A public API becomes an abuse or scraping vector | Per-key rate limits, scope minimisation, no bulk user export, cursor-only pagination, audit logging of key usage |
| A leaked key | Prefixed tokens for secret scanners, `lastUsedAt` visibility, one-click revoke, optional expiry |
| API contract ossifies development | Only `/api/v1/**` is contractual; internal routes stay free |
| Polygon format variance breaks the importer | Test against three real packages; unknown elements produce warnings, not failures; the publish gate is the safety net |
| Remote judging legal/ToS exposure | Metadata and links only by default; submission requires per-institution opt-in and the user's own credentials; documented plainly |
| Copyright on imported statements | Importer records `source` and `license` fields; imported problems display attribution; institution-only visibility by default |

## Definition of done

- [ ] `/api/v1` with cursor pagination, consistent envelopes and error codes
- [ ] Scoped API keys: create, show-once, rotate, revoke, per-key rate limits
- [ ] Webhooks with HMAC signing, retries, auto-disable and a delivery log
- [ ] OpenAPI generated from zod; `/developers` docs live
- [ ] Polygon + generic + CSV importers running as resumable queued jobs
- [ ] Import report with per-item outcomes, downloadable
- [ ] Embeddable SVG badges
- [ ] `RemoteProblem` references with attribution; adapter interface + Codeforces metadata
- [ ] Remote submission gated behind explicit per-institution opt-in
