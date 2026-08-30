# Phase 0 — Foundation & Safety Net

> **Execute with**: "execute Phase 0"
> **Effort**: 6–8 days · **Flag**: none (this phase *is* the flag infrastructure)
> **Depends on**: nothing · **Unblocks**: every subsequent phase

---

## Goal

Close the four defects in [Master Plan §3](../ULTIMATE_PLAN.md#3-critical-findings-in-the-current-code),
then install the machinery that makes fifteen more phases of change survivable:
a test harness, CI, migration discipline, feature flags, structured errors, a
unified authorization module, and error tracking.

## Why now

The current code leaks database credentials to any student who submits a program
(F-1) and offers anonymous unmetered code execution to the public internet (F-2).
Neither can wait behind a feature roadmap. Separately: there are two ad-hoc check
scripts and no test runner. Every phase after this one changes the schema and the
scoring path. Without a safety net the first regression is discovered by a teacher
during a live exam.

## Scope

- Security hotfixes F-1, F-2, F-3 (partial), F-4
- Vitest + a database-backed integration harness
- GitHub Actions CI: typecheck, lint, unit, integration, build
- `src/lib/errors.ts`, `src/lib/authz.ts`, `src/lib/flags.ts`, `src/lib/ratelimit.ts`
- Prisma migration workflow (the repo currently uses `db push`)
- Sentry + structured logging
- `.env.example` regenerated from the Appendix A registry

**Out of scope**: any new user-visible feature. If a change in this phase is
visible to a student, it is a bug fix, not a feature.

---

## Part 1 — Security hotfixes

### 1.1 F-1: strip the environment from untrusted processes

**File**: `src/lib/judge.ts`

`runProcess()` currently spawns with `env: process.env`. Replace with an explicit
allowlist, and add a second guard so production cannot silently use the
in-process compiler at all.

```ts
// src/lib/judge.ts

/** Untrusted code gets nothing from our environment. PATH is needed to exec,
 *  LANG keeps locale-dependent formatting stable across machines. */
const SANDBOX_ENV: NodeJS.ProcessEnv = {
  PATH: "/usr/local/bin:/usr/bin:/bin",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  HOME: "/tmp",
};

function runProcess(cmd: string, args: string[], opts: {...}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd,
    env: SANDBOX_ENV,          // was: process.env
    stdio: ["pipe", "pipe", "pipe"],
  });
  // ...unchanged
}
```

Then gate the local path in `compileAndJudge()` and `runCustom()`:

```ts
function localJudgeAllowed(): boolean {
  if (process.env.ALLOW_INSECURE_LOCAL_JUDGE === "1") return true;
  return process.env.NODE_ENV !== "production";
}
```

When neither the runner nor a remote judge is configured **and**
`localJudgeAllowed()` is false, return
`{ verdict: "IE", message: "Judge is not configured." }` rather than compiling
in-process. Log this at `error` level once per process — a production deployment
in this state is a misconfiguration that must be visible.

> The compile step is equally dangerous and equally covered: `#include`
> directives, `#pragma` hacks and pathological template instantiation all run
> with the compiler's environment. The allowlist applies to both spawns because
> both go through `runProcess`.

**Verify**: an integration test submits a program that prints
`getenv("DATABASE_URL")` and asserts the output is empty. This test must exist
permanently — it is the regression guard for the highest-severity finding in the
codebase.

### 1.2 F-2: meter anonymous execution

**New file**: `src/lib/ratelimit.ts`

A token-bucket limiter with two drivers: an in-memory `Map` for local dev and
single-instance deployments, and Redis from Phase 4. Same interface either way so
Phase 4 is a driver swap, not a call-site change.

```ts
export type RateLimitKey = { bucket: string; identity: string };
export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

export async function consume(
  key: RateLimitKey,
  limit: { tokens: number; windowSec: number; cost?: number }
): Promise<RateLimitResult>;
```

Buckets introduced in this phase:

| Bucket | Identity | Limit | Applies to |
|---|---|---|---|
| `run:anon` | client IP | 10 / 5 min | `POST /api/judge` `mode:"run"` with no session |
| `run:user` | user id | 60 / 5 min | `mode:"run"` with a session |
| `submit:user` | user id | 30 / 5 min | `mode:"submit"` |
| `submit:problem` | `userId:problemId` | 10 / 1 min | anti verdict-oracle probing |
| `auth:login` | IP + email | 10 / 15 min | `POST /api/auth/login` |
| `auth:forgot` | email | 3 / 60 min | password reset abuse |
| `runticket` | IP | 5 / 5 min | `POST /api/run-ticket` |

Client IP resolution: `x-forwarded-for` first hop, falling back to
`x-real-ip`, falling back to a constant (which effectively makes the bucket
global — a safe failure mode).

Additionally cap **global anonymous concurrency**. A simple in-process semaphore
in Phase 0 (`ANON_RUN_CONCURRENCY`, default 4); it becomes a Redis counter in
Phase 4. When saturated, return `429` with `Retry-After` rather than queueing —
an anonymous user waiting 30 s is a worse outcome than a clear "try again".

Anonymous runs also get **halved limits**: `min(problem.timeLimitMs, 2000)` and
half the output cap. A guest trying a sample does not need a 10-second budget.

### 1.3 F-3 (partial): make `MLE` reachable

Full memory accounting lands in Phase 3. In Phase 0, do the cheap half in
`runner/sandbox.js`: after each run, read the container's OOM counter and map to
`MLE`.

```js
// runner/sandbox.js — after runBatch's exec completes
async function oomKilled(name) {
  const r = await run("docker", ["inspect", "-f", "{{.State.OOMKilled}}", name],
                      { timeoutMs: 5000 });
  return r.stdout.trim() === "true";
}
```

If the process exited non-zero **and** `oomKilled()` is true, report `MLE`
instead of `RE`. Note the caveat in a comment: `State.OOMKilled` reflects the
whole container, so with a pooled container this is only reliable while one run
is in flight — Phase 3 replaces it with per-run cgroup `memory.events` reads.

Also stop advertising what is not yet delivered: leave the marketing copy alone
(it will be true after Phase 3) but add `MLE` to the golden-file conformance
suite as a **known-failing** case so Phase 3 has an executable target.

### 1.4 F-4: persist the right telemetry

**File**: `src/app/api/judge/route.ts`

```ts
const failing = result.results.find((r) => r.verdict !== "AC");
const shown   = failing ?? result.results[result.results.length - 1];
const maxTime = result.results.reduce((m, r) => Math.max(m, r.timeMs), 0);

await persistSubmission({
  // ...
  timeMs: maxTime,                                     // was: results[0].timeMs
  stdout: shown?.sample ? shown.stdout : undefined,    // never leak hidden output
  stderr: result.compileStderr || shown?.stderr,
  report: result,                                      // full per-test report
});
```

**Schema** (expand only — one nullable column):

```prisma
model Submission {
  // ...existing fields unchanged
  /// Full per-test judge report. Shape = JudgeReport in Appendix C; Phase 3
  /// normalises the fields this stores.
  report Json?
}
```

Note the second fix folded in above: today `stdout` from a **hidden** test is
persisted and shown in the admin submission viewer. That is correct for admins
but the same field feeds the student-facing history page. Gate on
`shown?.sample`.

---

## Part 2 — Test harness

### 2.1 Runner

Vitest — fastest path, native ESM/TS, no Babel, and it already understands the
`@/` alias via `vite-tsconfig-paths`.

```
npm i -D vitest @vitest/coverage-v8 vite-tsconfig-paths
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: { reporter: ["text", "lcov"], include: ["src/lib/**"] },
    setupFiles: ["tests/setup.ts"],
    pool: "threads",
  },
});
```

### 2.2 Three test tiers

| Tier | Location | Needs a DB | Runs in CI |
|---|---|---|---|
| **Unit** — pure logic | beside the source, `src/lib/x.test.ts` | no | every push |
| **Integration** — Prisma + routes | `tests/integration/` | yes (ephemeral) | every push |
| **Judge conformance** — golden files | `tests/golden/` | no (needs Docker) | nightly + on `runner/**` changes |

### 2.3 Seed the tiers with tests that matter

Do not chase coverage. Write tests for the code that, if wrong, is expensive:

**Unit** (`src/lib/`):
- `contest-dashboard.test.ts` — `buildContestDashboard` is already pure and is
  the highest-complexity function in the repo (cc≈45). Cover: penalty
  accumulation, freeze cutoff at the boundary minute, first-blood marking,
  practice-solve merge, a participant with zero submissions, and the
  off-by-one at `now === freezeAt`.
- `contests.test.ts` — `contestPhase`, `effectiveContestStatus`,
  `isContestPublic` across the full status × time matrix.
- `leaderboard.test.ts` — tier counting, range cutoffs, sort stability.
- `run-ticket.test.ts` — expiry, tamper (flipped byte in the signature), replay.
- `difficulty.test.ts`, `universities.test.ts` — cheap, catches typos.

**Integration** (`tests/integration/`):
- `judge-route.test.ts` — the F-1 environment-leak guard; the contest gate
  (unregistered, not-in-contest, contest closed, `maxSubmissionsPerProblem`);
  guest `run` allowed, guest `submit` rejected with 401.
- `auth.test.ts` — register → verify → login → reset happy path, plus rate-limit
  rejection after N attempts.
- `ratelimit.test.ts` — bucket exhaustion and refill.

**Golden** (`tests/golden/`): one directory per case, containing `main.c`,
`stdin`, `expected-verdict`. Cases: `ac`, `wa`, `tle-loop`, `re-segv`,
`re-divzero`, `ce-syntax`, `mle-alloc` *(expected to fail until Phase 3)*,
`ole-spam` *(same)*, `fork-bomb` (must be contained, verdict `RE`),
`env-read` (must print nothing), `net-egress` (must fail to connect).

This golden suite becomes the acceptance gate for Phase 3 and the regression
guard for every judge change thereafter. Build it now while the expected
behaviour is small and knowable.

### 2.4 Ephemeral test database

`tests/setup.ts` resolves `DATABASE_URL` for tests in this order:

1. `TEST_DATABASE_URL` if set (CI provides a service container).
2. Otherwise a Neon branch if `NEON_API_KEY` is present.
3. Otherwise skip the integration tier with a clear message — a contributor
   without a database still gets the unit tier.

Each integration file runs inside a transaction that is rolled back, except the
handful that need committed state; those use a per-file schema namespace.

Port the two existing scripts (`scripts/check-contest-scoring.ts`,
`scripts/check-judge.ts`) into the suite and delete them — one way to run
checks, not three.

---

## Part 3 — CI

`.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: contesthub_test }
        options: >-
          --health-cmd pg_isready --health-interval 5s
          --health-timeout 5s --health-retries 10
        ports: ["5432:5432"]
    env:
      TEST_DATABASE_URL: postgresql://postgres:test@localhost:5432/contesthub_test
      AUTH_SECRET: test-secret-not-used-anywhere-real
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm run test -- --coverage
      - run: npm run build

  judge-conformance:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule' || contains(github.event.head_commit.message, '[judge]')
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t contest-hub-sandbox -f runner/sandbox.Dockerfile runner/
      - run: npm ci && npm run test:golden
```

New scripts in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:golden": "vitest run tests/golden",
"typecheck": "tsc --noEmit",
"verify": "npm run typecheck && npm run lint && npm run test"
```

---

## Part 4 — Cross-cutting modules

### 4.1 `src/lib/errors.ts`

```ts
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) { super(message); }
}

export class ValidationError extends AppError { constructor(m: string, d?: unknown) { super("VALIDATION", m, 400, d); } }
export class AuthError       extends AppError { constructor(m = "Sign in to continue.") { super("UNAUTHENTICATED", m, 401); } }
export class ForbiddenError  extends AppError { constructor(m = "You do not have access to this.") { super("FORBIDDEN", m, 403); } }
export class NotFoundError   extends AppError { constructor(m = "Not found.") { super("NOT_FOUND", m, 404); } }
export class ConflictError   extends AppError { constructor(m: string) { super("CONFLICT", m, 409); } }
export class RateLimitError  extends AppError { constructor(readonly retryAfterSec: number) { super("RATE_LIMITED", "Too many requests. Try again shortly.", 429); } }
export class InternalError   extends AppError { constructor(m = "Something went wrong.") { super("INTERNAL", m, 500); } }

/** Every API route ends here. Never hand-roll a status code. */
export function toResponse(err: unknown): Response;
```

`toResponse` logs anything that is not an `AppError` at `error` level with the
request id, reports it to Sentry, and returns a generic 500 body — internal
messages never reach the client.

Migrate all 17 existing routes onto `toResponse`. This is mechanical and it is
what makes the next fifteen phases' error handling consistent for free.

### 4.2 `src/lib/authz.ts`

Today authorization is `requireAdmin()` plus inline checks scattered through
route handlers. That does not survive TEACHER and TA.

```ts
export type Action =
  | "contest:create" | "contest:edit" | "contest:delete" | "contest:viewPrivate"
  | "problem:create" | "problem:edit" | "problem:viewHiddenTests"
  | "submission:viewAny" | "submission:viewOwn" | "submission:rejudge"
  | "user:manage" | "system:admin";

export type Actor = SessionUser | null;

/** The only place a permission decision is made. */
export function can(actor: Actor, action: Action, resource?: Resource): boolean;

/** Throws ForbiddenError/AuthError. Use in routes and server components. */
export function assertCan(actor: Actor, action: Action, resource?: Resource): void;
```

In Phase 0 the implementation is trivial (`ADMIN` can everything, `USER` can own
resources). Phase 1 fills in TEACHER/TA and ownership rules. The point of doing
it now is that every route gets the *call site* installed before there are 60
routes to retrofit.

### 4.3 `src/lib/flags.ts`

```ts
export type Flag =
  | "institutions" | "teacherRole" | "problemDb" | "judgeV2"
  | "judgeQueue" | "classroom" | "ratings" | "integrity";

export async function isEnabled(flag: Flag, ctx?: { userId?: string; role?: Role }): Promise<boolean>;
```

Resolution order: `process.env["FLAGS_" + SCREAMING(flag)] === "1"` → a
`FeatureFlag` DB row (added in this phase: `key`, `enabled`, `rolloutPercent`,
`allowRoles[]`) → `false`. Cached in-process for 30 s.

### 4.4 Structured logging + Sentry

`src/lib/log.ts` — a thin wrapper emitting single-line JSON
(`{ level, msg, requestId, userId, ...fields }`). Not a logging framework;
roughly 40 lines. `console.log` in `src/` becomes a lint error.

Sentry via `@sentry/nextjs` with `SENTRY_DSN` optional — absent DSN disables it
cleanly so local dev and contributors are unaffected.

---

## Part 5 — Migration discipline

The repo uses `prisma db push`, which is fine for prototyping and unacceptable
for a graded system. Switch to migrations:

1. `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0000_init/migration.sql`
2. `npx prisma migrate resolve --applied 0000_init` against each existing
   environment so the baseline is recorded without re-running.
3. Replace `db:push` in `package.json` with `db:migrate` / `db:deploy`. Keep
   `db:push` available as `db:push:danger` for throwaway local work only.
4. Add `DIRECT_URL` to the datasource — Neon's pooled connection cannot run DDL.

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Create `scripts/migrations/` with a `runBackfill()` helper providing the batching,
cursor-resume and idempotency contract from
[Appendix G](../ULTIMATE_PLAN.md#appendix-g--migration-discipline). Phase 1's
institution backfill is its first consumer.

---

## Schema changes

Two additive changes only. Both are pure expand steps — no backfill, no contract.

```prisma
model Submission {
  // ...unchanged
  report Json?          // F-4: full per-test judge report
}

model FeatureFlag {
  key            String   @id
  enabled        Boolean  @default(false)
  rolloutPercent Int      @default(0)
  allowRoles     String[] @default([])
  note           String   @default("")
  updatedAt      DateTime @updatedAt
}
```

**Migration**: `0001_phase0_foundation`. Down-path: drop both — no data depends
on them yet.

---

## File manifest

### Create

| Path | Purpose |
|---|---|
| `vitest.config.ts` | Test runner config |
| `tests/setup.ts` | DB resolution, global fixtures |
| `tests/integration/judge-route.test.ts` | F-1 guard, contest gate, guest rules |
| `tests/integration/auth.test.ts` | Auth lifecycle + rate limits |
| `tests/golden/**` | Judge conformance corpus (11 cases) |
| `src/lib/errors.ts` | Error taxonomy + `toResponse` |
| `src/lib/authz.ts` | `can` / `assertCan` |
| `src/lib/flags.ts` | Feature flags |
| `src/lib/ratelimit.ts` | Token buckets, memory driver |
| `src/lib/log.ts` | Structured logging |
| `src/lib/request-context.ts` | Request id + actor propagation |
| `scripts/migrations/_helper.ts` | Batched backfill contract |
| `.github/workflows/ci.yml` | CI |
| `sentry.server.config.ts`, `sentry.client.config.ts` | Error tracking |
| `docs/RUNBOOK.md` | Incident procedures (starts thin, grows each phase) |

### Modify

| Path | Change |
|---|---|
| `src/lib/judge.ts` | `SANDBOX_ENV`; `localJudgeAllowed()` gate |
| `src/app/api/judge/route.ts` | Rate limits, F-4 telemetry, `toResponse`, anon limit halving |
| `src/app/api/run-ticket/route.ts` | Rate limit |
| `src/app/api/auth/*/route.ts` (7 files) | Rate limits, `toResponse` |
| `src/app/api/admin/**` (3), `src/app/api/profile/**` (2), `src/app/api/contests/**` (1), `src/app/api/problems/**` (1) | `assertCan` + `toResponse` |
| `runner/sandbox.js` | OOM → `MLE` |
| `prisma/schema.prisma` | `Submission.report`, `FeatureFlag`, `directUrl` |
| `package.json` | Test/verify scripts, vitest deps, `db:migrate` |
| `.env.example` | Regenerate from Appendix A |
| `eslint.config.mjs` | Ban `console.*` in `src/`, ban `process.env` outside `src/lib/env.ts` |
| `src/lib/types.ts` | Add `PA`, `OLE`, `IE`, `PENDING`, `JUDGING` to `JudgeVerdict` |

---

## Testing plan

| What | How |
|---|---|
| F-1 fixed | Integration test: submit `getenv("DATABASE_URL")` printer → empty stdout |
| F-1 gate | Unit test: `localJudgeAllowed()` false under `NODE_ENV=production` without opt-in |
| F-2 fixed | Integration test: 11 anonymous runs → 11th returns 429 with `Retry-After` |
| F-3 partial | Golden case `mle-alloc` recorded as known-failing with a linked TODO to Phase 3 |
| F-4 fixed | Unit test: 20-test AC report → persisted `timeMs` equals the maximum |
| Hidden output not leaked | Integration test: WA on a hidden test → response contains verdict, not `expected` |
| No regressions | Full suite green; `npm run build` succeeds |

---

## Acceptance criteria

1. A submitted C program cannot read any environment variable the server holds —
   proven by a test that fails if `SANDBOX_ENV` is reverted.
2. A production build with no runner and no `JUDGE0_URL` refuses to judge and
   logs a configuration error, instead of compiling in-process.
3. The 11th anonymous run inside 5 minutes from one IP returns `429`.
4. `npm run verify` runs typecheck, lint and the full suite in under 90 s.
5. CI is green on `main` and required for merge.
6. Every API route returns errors through `toResponse` — verified by a lint rule
   or a grep in review.
7. `prisma migrate status` reports no drift on every environment.
8. A `Submission` row for a 20-test AC records the slowest test's time.

## Rollback

Every change is additive or a strict narrowing. Rollback is a revert; no data
migration is involved. The one behavioural risk is the rate limiter rejecting
legitimate traffic — `FLAGS_RATELIMIT=0` disables enforcement while still
recording what *would* have been limited, so tuning happens on real data.

## Risks

| Risk | Mitigation |
|---|---|
| Rate limits too tight for a lab of 60 students behind one NAT IP | Per-IP limits apply to *anonymous* traffic only; authenticated students are limited per user. Institution IP allowlist available in Phase 1. |
| Baselining migrations against a live Neon DB goes wrong | Take a Neon branch first; run `migrate resolve` against the branch and diff before touching production |
| Integration tests slow CI down | Transaction rollback per test; the Docker-dependent golden tier runs nightly, not per push |

## Definition of done

- [ ] F-1, F-2, F-4 fixed with permanent regression tests
- [ ] F-3 partially fixed; golden case exists and is tracked to Phase 3
- [ ] Vitest running three tiers; ≥ 60% coverage of `src/lib/`
- [ ] CI green and required
- [ ] `errors.ts`, `authz.ts`, `flags.ts`, `ratelimit.ts`, `log.ts` in place and adopted by all 17 routes
- [ ] Prisma migrations baselined; `db push` retired
- [ ] `.env.example` matches Appendix A
- [ ] `docs/RUNBOOK.md` created with the judge-misconfiguration and rate-limit entries
- [ ] Master plan §3 updated to mark F-1/F-2/F-4 resolved
