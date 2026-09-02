# Runbook

Incident procedures for ContestHub. Starts thin in Phase 0 and grows with
each phase — add an entry here whenever a phase introduces a new failure mode
an on-call person would need to diagnose without reading the source first.

---

## Judge is refusing to run submissions (`IE` / "Judge is not configured")

**Symptom**: every submission and run comes back with verdict `IE` and the
message "Judge is not configured." Server logs show:

```
Judge misconfigured: no runner/remote judge configured and
ALLOW_INSECURE_LOCAL_JUDGE is not set in production. Refusing to compile
untrusted code in-process.
```

**Cause**: this is the F-1 safety gate in `src/lib/judge.ts`'s
`localJudgeAllowed()` working as designed. In production, with `NODE_ENV`
unset or `"production"`, the in-process compile-and-run path is disabled
unless one of the real execution backends is configured — a bare deployment
with none of them configured must refuse to judge, not silently fall back to
running untrusted code with the server's own environment and no sandbox.

**Fix**: configure exactly one real backend, in order of preference:

1. **Runner** (preferred): set `NEXT_PUBLIC_RUNNER_URL` and `RUNNER_TOKEN` to
   point at a running `runner/` service with `contest-hub-sandbox` built
   (`npm run build:image` in `runner/`). Redeploy — `NEXT_PUBLIC_RUNNER_URL`
   is inlined at build time.
2. **Remote judge**: set `JUDGE0_URL` (and `JUDGE0_KEY`/`JUDGE0_HOST` if using
   a hosted instance).
3. **Last resort, self-hosted-only**: set `ALLOW_INSECURE_LOCAL_JUDGE=1`. This
   re-enables the in-process compiler with no sandbox isolation — only
   acceptable when the whole app process itself is already sufficiently
   isolated (e.g. a disposable VM with nothing else on it). Do not set this on
   a shared or multi-tenant deployment.

**Verify**: submit any problem's sample input and confirm a real verdict
(not `IE`) comes back. `src/lib/judge.test.ts`'s `localJudgeAllowed` suite is
the permanent regression guard for this gate — a change that silently expands
when the local path is allowed should fail that suite.

---

## Judge runner returning `RE`/`fetch failed` instead of judging

**Symptom**: logs show `runner judge failed, falling back` with a `fetch`
error, and the app falls through to remote judge / local compile.

**Cause**: `NEXT_PUBLIC_RUNNER_URL` or `RUNNER_TOKEN` point at a runner
that's down, unreachable, or has a mismatched token. `compileAndJudge()`
catches this and falls back automatically — the request still gets a verdict,
just via a slower/weaker path — but it means the runner's guarantees (Docker
sandbox isolation, wall-clock-accurate timing) are not actually in effect for
that request.

**Fix**: check the runner service's `/health` endpoint and process status.
Confirm `RUNNER_TOKEN` matches between the app and the runner's own env.
Confirm the sandbox image exists (`docker image inspect contest-hub-sandbox`
on the runner host) — the runner refuses to start without it.

---

## Legitimate users hitting `429` rate limits

**Symptom**: a lab of students behind one NAT IP (or a single very active
user) starts seeing `429` responses with a `Retry-After` header.

**Cause**: `src/lib/ratelimit.ts`'s per-identity token buckets — see the
table in that file's header comment for current limits per bucket
(`run:anon`, `run:user`, `submit:user`, `submit:problem`, `auth:login`,
`auth:forgot`, `runticket`). Anonymous (`run:anon`) buckets key on IP, so a
whole lab behind one router shares one bucket.

**Fix, in order of preference**:

1. If it's a genuine one-off spike (e.g. a graded lab session), this is
   working as intended — advise students to sign in, since `run:user` limits
   are 6x higher than `run:anon` and are keyed per-account instead of shared
   per-IP.
2. If limits are structurally too tight for normal use, set
   `FLAGS_RATELIMIT=0` to disable enforcement while `consume()` still runs
   and reports what *would* have been limited (check logs) — this buys time
   to retune the numbers on real traffic data without leaving the endpoint
   fully unmetered.
3. Institution-level IP allowlisting is out of scope for Phase 0 — tracked
   for Phase 1.

**Do not** raise `ANON_RUN_CONCURRENCY` or the `run:anon` token count as a
first response to a report of `429`s without checking whether the traffic is
actually legitimate — F-2 exists because anonymous judge execution is a
real abuse surface (unmetered compute on the public internet), not a UX
inconvenience to be tuned away by default.

---

## Suspected environment/secret leak from a submission

**Symptom**: a submission's stdout contains something that looks like a
connection string, API key, or other secret shape.

**Cause**: this should be structurally impossible after F-1 — `runProcess()`
in `src/lib/judge.ts` spawns every compile and run with `env: SANDBOX_ENV`
(a fixed, secret-free allowlist: `PATH`, `LANG`, `LC_ALL`, `HOME`), never
`process.env`. Treat any report of this as a **severity-1 security
regression**, not routine rate-limit noise.

**Immediate response**:

1. Confirm by re-running `src/lib/judge.test.ts`'s F-1 regression test
   (`runCustom` a `getenv("DATABASE_URL")` printer, assert empty stdout) and,
   if Docker is available, the golden suite's `env-read` case.
   `git blame src/lib/judge.ts` around `SANDBOX_ENV` and `runProcess` for
   anything that reintroduced `process.env`.
2. If confirmed, rotate every credential currently in the server's
   environment (`DATABASE_URL`/`DIRECT_URL`, `AUTH_SECRET`, `SMTP_*`,
   `RUNNER_TOKEN`, `JUDGE0_KEY`) — assume the exposure was not limited to
   whoever reported it.
3. Revert to the last known-good deploy while the regression is fixed and
   the F-1 test suite is confirmed green again.

---

## `prisma migrate status` reports drift

**Symptom**: `npx prisma migrate status` shows the database schema does not
match `prisma/migrations/`.

**Cause**: someone ran `prisma db push` (or a manual `ALTER`/`CREATE`)
directly against an environment instead of going through a migration. Phase 0
retired `db push` from normal use — it survives only as `db:push:danger` for
throwaway local work, precisely because a graded system cannot tolerate
undocumented schema drift.

**Fix**: never run `prisma migrate resolve` to paper over unexplained drift.
Diff what actually changed (`prisma migrate diff --from-url <url>
--to-schema-datamodel prisma/schema.prisma`), understand why it happened, and
either write a proper migration capturing the intended change or reconcile
the drifted environment back to match `prisma/schema.prisma` before
resuming normal `db:migrate`/`db:deploy` use.

---

## Phase 1 migration: `University` enum → `Institution` table, `Role` expansion

**What shipped**: migration `0002_institutions_rbac_sessions` replaces the
4-value `University` enum with `Institution`/`InstitutionDomain` tables,
expands `Role` from `USER | ADMIN` to `STUDENT | TEACHER | TA | ADMIN`, and
adds the `Session` table for refresh-token rotation. `prisma/seeds/institutions.ts`
seeds ~70 Bangladeshi institutions; run it via `npm run db:seed`.

**How it was actually applied**: Phase 1's design doc specifies a cautious
three-deploy expand → backfill → contract path for a database with real user
rows (`ALTER TYPE ... ADD VALUE` first, backfill in a follow-up release,
`DROP TYPE` only after a soak period). This repo's database held test data
only at the time of migration, so that was intentionally skipped in favor of
one direct migration to the final schema — confirmed with the project owner
before running anything destructive. **If this migration has not yet reached
a database with real user rows, do not reapply this shortcut** — follow the
staged plan in `docs/phases/DONE__PHASE-01-identity-institutions.md` instead
(`ALTER TYPE Role ADD VALUE`, non-transactional; backfill `institutionId` from
the old `university` enum value; reconciliation query must return 0 before the
contract step runs).

**If `prisma migrate deploy` fails partway through this migration**: the
`AlterEnum` block is wrapped in its own `BEGIN`/`COMMIT` and rolls back
cleanly on failure, but a `CREATE TYPE` statement that runs *before* that
block (e.g. `InstitutionType`) is not transactional and can be left behind.
Check for it directly (`SELECT typname FROM pg_type WHERE typname =
'InstitutionType'`) and `DROP TYPE` it before retrying, then
`prisma migrate resolve --rolled-back <name>` to clear the failed record.

**Gotcha hit during this migration**: `prisma migrate diff` ordered a
generated `ALTER TABLE "InstitutionDomain" ALTER COLUMN "roleHint" TYPE
"Role_new"` statement *before* the `CREATE TABLE "InstitutionDomain"`
statement further down the same file — the diff tool assumed the table
already existed. Always review a generated migration for statement order
before applying it; don't trust `migrate diff` output blindly on a schema
with new tables that reference an altered enum.

---

## Phase 2 migration: Problem Domain (`Problem`/`ProblemVersion`/test data → DB)

**What shipped**: migration `0003_problem_domain` adds the enums
(`ProblemStatus`, `ProblemVisibility`, `CheckerType`; `Difficulty` was also
promoted from a free-text label to an enum, `@map`-ed back to the legacy
label strings so existing string comparisons keep working) and the tables
(`Problem`, `ProblemVersion`, `TestGroup`, `TestCase`, `ReferenceSolution`,
`Tag`, `ProblemTag`, `ProblemStats`), plus nullable `problemRefId`/
`problemVersionId` FK columns on `Submission`, `SolvedProblem`, and
`ContestProblem`. `src/lib/problems.ts` is now DB-backed by default (gated by
the `problemDb` feature flag — flip it off to fall back to the legacy
`data/problems.json` reader for rollback; every exported function became
`async`, so every call site had to add `await`).

**How it was actually applied**: unlike Phase 1's "one direct migration"
shortcut, Phase 2 kept the shape of expand → backfill → contract because the
backfill step (migrating 700 real problems' worth of test data into blob
storage) needed its own reconciliation checkpoint before going near
production data:
1. `0003_problem_domain` — expand: new tables/enums, nullable FK columns only.
2. `scripts/migrations/0004-import-problem-bank.ts` — reads
   `data/problems.json` and creates a `Problem` + frozen v1 `ProblemVersion` +
   `TestGroup`/`TestCase` rows (blob-uploaded, inlined under 4 KB) for each of
   700 problems. Idempotent on `slug`, resumable via a cursor file. Verified
   run: 700 problems, 700 versions, 1400 groups, 688 cases, 42 tags, 2001
   problem-tag links, 0 conformance failures.
3. `scripts/migrations/0005-link-problem-refs.ts` — batched backfill that
   points existing `Submission`/`SolvedProblem`/`ContestProblem` rows'
   `problemRefId` at the newly-created `Problem` row sharing its slug, plus a
   reconciliation query (must return 0 unmatched rows) run before treating the
   backfill as complete.
`data/problems.json` stays in the repo as the disaster-recovery/reseed
artifact — it is not deleted.

**Drift hit before this migration could run**: `prisma migrate dev` refused
with "modified after it was applied" and threatened `migrate reset`. A prior
`0002_institutions_rbac_sessions` row in `_prisma_migrations` had a checksum
mismatch (`applied_steps_count=0`, `finished_at=null`) sitting alongside a
second, successful row for the same migration — a failed-then-superseded
apply left the ledger in a state `migrate dev`'s drift check couldn't
reconcile automatically. Fixed non-destructively with
`npx prisma migrate resolve --rolled-back 0002_institutions_rbac_sessions`
(the failed row only — never resolve a row that actually matches the current
schema), then generated `0003_problem_domain` via `prisma migrate diff
--from-schema-datasource prisma/schema.prisma --to-schema-datamodel
prisma/schema.prisma --script` + `prisma migrate deploy`, bypassing
`migrate dev`'s shadow-database check entirely rather than fighting it.
**Do not `prisma migrate reset` to work around ledger drift like this** — it
would have destroyed the very seed/import data the migration was being
prepared for.

**Gotcha hit during the import script**: the initial `0004` run put every
`storeCaseBlob()` blob write for a problem *inside* the same
`prisma.$transaction` as its row creates. Prisma's interactive-transaction
default timeout is 5000 ms; blob I/O for a problem with several test files
routinely exceeded it (`P2028`). Fixed by moving all blob writes before the
transaction opens and raising the transaction's own timeout
(`{ timeout: 20_000 }`) for the row-creation step that remains inside it.

---

## Judge queue (Phase 4)

`FLAGS_JUDGE_QUEUE=1` moves judging from the synchronous `POST /api/judge`
path onto a Redis/BullMQ queue consumed by `worker/`. The `/admin/system`
"Judge" panel (`src/lib/queue-stats.ts`) is the first stop for all four
alerts below — check it before anything else.

### Queue depth > 3× total concurrency for 2 minutes

**Symptom**: the panel's queue depth climbs and stays high; students report
submissions stuck on "Queued…".

**Cause**: either genuine demand exceeds capacity (a contest burst — the
expected case the doc's load-test scenarios exist to size for) or workers
have stopped consuming (crashed, deadlocked, or the Docker socket they
depend on is unreachable).

**Fix**: check the worker roster in the panel first — if `lastSeenAt` is
fresh and stalled/re-queued count is climbing, workers are alive but slow
(check host CPU/Docker daemon health on the VPS). If the roster is empty or
all stale, the worker process itself is down — `docker ps` / `systemctl
status` on the VPS, restart it, then watch depth drain. If depth is high with
healthy workers, this is real load: bring up an additional worker (`worker/`
scales horizontally — the queue and per-user fairness cap are shared via
Redis) rather than raising `WORKER_CONCURRENCY` past what the host's sandbox
pool can actually run concurrently.

### Oldest queued job age > 60s

**Symptom**: depth may look normal, but a specific job (or a low-priority
class — see D3's priority table in the phase doc) has been sitting for over
a minute.

**Cause**: usually starvation, not raw capacity — a burst of high-priority
(contest) submissions can push a p10/p20 job's wait past this threshold even
when total depth is unremarkable. Rarely, a stuck job that keeps losing the
claim race (a bug, not load) accumulates age without ever running.

**Fix**: check `depthByPriority` in the panel — if lower-priority buckets are
piling up while priority 0 stays empty, this is fairness working as intended
under load; it resolves itself once the burst clears. If a *specific*
submission id is reported stuck, check its `attempts` count in
`/admin/submissions/[id]` — if `attempts` keeps climbing without a terminal
state, that submission is failing the claim/report cycle repeatedly; check
worker logs for that submission id for the underlying error.

### Any worker heartbeat stale > 2 minutes

**Symptom**: a row in the worker roster shows "Stale" — `lastSeenAt` hasn't
updated recently even though the process may still be running.

**Cause**: the worker's `registerWorker()`/`touchWorker()` calls
(`worker/src/index.ts`) failed — almost always a lost Postgres connection
from that host, not the worker being fully dead (a fully dead worker's jobs
show up as stalled `Submission` rows instead, via heartbeatAt on the
submission itself, which the reaper — `src/lib/queue/reaper.ts` — handles
independently every 30s).

**Fix**: `docker logs` / journal on the affected worker host for connection
errors. Confirm the worker's restricted DB role
(`worker/README.md`'s `judge_worker` role) hasn't been revoked or its
password rotated without updating the worker's `DATABASE_URL`. If the worker
process is actually dead, its in-flight submissions self-heal via the
reaper within 90s of their last heartbeat — no manual requeue needed.

### `IE` rate > 1% over 5 minutes

**Symptom**: the panel's IE rate stat is elevated; submissions are coming
back with verdict `IE` instead of a real judged result.

**Cause**: this is the queue-era version of the existing "Judge is refusing
to run submissions" entry above — a fault in the judge *engine* itself
(sandbox image missing, compiler crash, `compileAndJudge` throwing), now
surfaced per-worker instead of per-request. Distinguish from the synchronous
path's version by checking the worker's `failedCount` in the roster — a
single bad worker with a high failedCount points at that host specifically
(bad image, disk full, Docker daemon issue on that VPS) rather than a
systemic judge misconfiguration.

**Fix**: same remediation as the synchronous-path entry above
(confirm the sandbox image, check `runner/images.lock.json` provenance), but
applied to the specific worker host identified by its roster row. A
submission that exhausts `MAX_ATTEMPTS` (3) without a worker succeeding is
marked `FAILED`/`IE` permanently by the reaper — rejudge it (`/admin/rejudge`)
once the underlying fault is fixed rather than expecting it to self-heal.
