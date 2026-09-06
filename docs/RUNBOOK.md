# Runbook

Incident procedures for CodeHub. Starts thin in Phase 0 and grows with
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
   point at a running `runner/` service with `codehub-sandbox` built
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
Confirm the sandbox image exists (`docker image inspect codehub-sandbox`
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

---

## Backup, restore drills, and disaster recovery (Phase 13 Part 6)

Full scenario decision trees (Neon outage, worker host loss, Redis loss, R2
outage, a bad migration, a compromised key, a compromised worker host) live in
`docs/DR.md` — this entry is just the pointer and the two operational
mechanics that back it.

### Nightly backup didn't run / hasn't uploaded

**Symptom**: no new object under `backups/postgres/` in R2 for more than 24h
(check via the R2 dashboard or `aws s3 ls`, once a bucket is actually
provisioned — none is in this environment yet).

**Cause**: `scripts/backup-nightly.sh` is not scheduled anywhere in this repo
yet (no cron entry, no CI workflow) — it is a ready-to-use script, not an
active job. If it *is* wired into a scheduler elsewhere and stopped
producing objects, check that scheduler's own logs first; the script itself
exits early (exit 0, not an error) with a clear message if `R2_*` env vars
are unset, so a silent "job ran, nothing happened" almost always means
missing/rotated credentials in the scheduler's environment, not a script bug.

**Fix**: run `./scripts/backup-nightly.sh` manually with the `R2_*` vars and
`DIRECT_URL` set to confirm it still works end to end; if it does, the
scheduler config (cron entry, CI secret) is the thing to fix, not the script.

### A restore drill is due (quarterly) or was requested ad hoc

Run `npx tsx scripts/migrations/dr-restore-drill.ts` (optionally
`--dump-file` pointing at a downloaded nightly dump). It resolves a scratch
restore target from `TEST_DATABASE_URL` or `NEON_API_KEY`/`NEON_PROJECT_ID`
(same resolution order as the test suite's own Neon-branch provisioning in
`tests/global-setup.ts`), restores the dump, runs `npm run test` against it,
and prints elapsed time per stage. Record the result in
`docs/DR-DRILL.md` using its entry template — including a failed or partial
drill; a drill that finds nothing wrong on the first run is the surprising
outcome, not the expected one.

---

## Cost model looks wrong on `/admin/costs` (Phase 13 Part 7)

**Symptom**: the estimated monthly cost or per-1000-submissions figure on
`/admin/costs` looks implausible for the platform's actual usage.

**Cause**: `/admin/costs` renders the static Appendix I cost *model*
(`src/lib/cost.ts`), mapped onto the nearest scale tier by live
`User`/`Submission` counts — it is not a live billing feed. There is no
billing API integration for any provider (Vercel, Neon, Upstash, R2,
Hetzner, Sentry, SMTP/Resend) in this codebase, so a mismatch against an
actual invoice is expected whenever real usage doesn't match the model's
assumptions (e.g. burst judge-worker cost during an exam week, or a paid
tier the model doesn't know about).

**Fix**: this is not a bug to "fix" in the usual sense — if the model is
meaningfully stale, update the tier figures in `src/lib/cost.ts`'s
`COST_MODEL` table to match current provider pricing/plan, and note the
change in a commit message so the Appendix I source of truth
(`docs/ULTIMATE_PLAN.md`) and this table don't silently drift apart.

---

## Load-testing with a realistic dataset (Phase 13 Part 8)

**When you need it**: verifying a page (profile, contest standings,
analytics, search) still meets its Appendix F budget at real volume, or
sizing autoscaling/database changes before a semester with more students.

**How**: `npx tsx scripts/seed-load.ts --count 100000` (the default) seeds a
local/scratch database with a statistically shaped `Submission` dataset —
weighted verdict mix, submissions clustered around contest windows, and a
power-law per-user activity distribution — reusing whatever `User`/`Problem`
rows `npm run db:seed` already created. For a full 10M-row load test, see the
script's own header comment for the `--count`/`--batch-size` values to use
and the "never against production" warning. Never point this at a production
`DATABASE_URL` — it writes real rows, not a dry run.

---

## Worker autoscaling and pre-scaling for a big contest (Phase 13 Part 4)

Judge load is spiky — a 300-student midterm needs ten minutes of real
capacity per week, not a permanently larger fleet. Two mechanisms exist:

1. **Contest-aware pre-warm** (always on, no configuration needed):
   `prewarmUpcomingContests()` in `src/lib/contest-lifecycle.ts`, called every
   minute from `worker/src/contest-tick.ts`, logs a `"contest pre-warm"`
   structured event for every `SCHEDULED` contest starting within 15 minutes
   with more than 50 registered participants, and calls the autoscale
   controller's `ensureWorkerCapacity()` entry point.
2. **Queue-depth autoscaling controller** (`src/lib/autoscale.ts`, running on
   `worker/src/autoscale-tick.ts` every 30s): scales up when queue depth
   exceeds 2x total worker concurrency for a sustained 60s, scales down after
   10 minutes sustained below 0.5x, with a 5-minute cooldown between actions
   and a hard cap from `HETZNER_MAX_WORKERS` (default 5). Gated on the
   `scaleOps` flag. The actual Hetzner Cloud API call
   (`applyHetznerScaling()`) is implemented but only reachable when
   `HETZNER_API_TOKEN` is set — **no Hetzner project exists in this
   environment**, so both mechanisms currently only produce log lines
   (`"autoscale decision"` / `"pre-warm ensure-capacity"`), never a real
   server create/destroy call.

### Manual pre-scaling procedure (option 1 — do this today, no infra required)

Until a real Hetzner project is wired up (or as a supplement even after it
is — automation should not be the only thing standing between a midterm and
enough judge capacity), pre-scale by hand before any contest expected to draw
a large simultaneous burst:

1. **Find out what's coming.** Query upcoming contests with a large expected
   field: `SELECT slug, title, "startsAt", "participantCount" FROM "Contest"
   WHERE status = 'SCHEDULED' AND "startsAt" > now() ORDER BY "startsAt" ASC;`
   — or watch the `"contest pre-warm"` log lines emitted starting 15 minutes
   out, which already apply the same `participantCount > 50` filter.
2. **Bring up an extra worker host** at least 15–20 minutes before
   `startsAt`. `worker/` scales horizontally — the queue and per-user
   fairness cap are shared via Redis, so a second `npm run worker:start` (or
   `docker`/`systemd` unit) on another VPS just adds capacity, no
   coordination needed. See `worker/README.md` for the `judge_worker` DB role
   and environment the new host needs.
3. **Watch `/admin/system`'s Judge queue panel** as the contest starts —
   confirm the new worker shows up in the roster with a fresh `lastSeenAt`
   and queue depth stays flat rather than climbing.
4. **Tear the extra host down** after the contest ends and the queue has
   drained (depth back to near zero, no stale workers) — this is manual
   capacity, so nothing removes it automatically.

**Admin UI for this** (a `/admin/contests` view filtering to "upcoming
contests with >50 registrants in the next 24h") is a stretch goal, not built
this session — the query in step 1 above is the same filter it would run;
for now, run it directly or watch the pre-warm log lines.

---

## SLO alerts (Phase 13 Part 5)

`src/lib/slo.ts` computes the SLO table from
`docs/phases/PHASE-13-scale-ops.md` Part 5 against whatever data is actually
available today — `/admin/system`'s new "SLOs" section shows current status
for all eight rows. `worker/src/slo-alert-tick.ts` checks the same table every
5 minutes and, for anything in `breach`, emails `SLO_ALERT_EMAIL` (falling
back to `ADMIN_EMAIL`) and posts to a Telegram chat via
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`. **Neither channel is configured in
this environment** — an unconfigured channel logs a warning and no-ops rather
than failing the tick, so a breach today is only visible in `/admin/system`
and the tick's own `"SLO breach detected"` log line, not by email/Telegram,
until those env vars are set.

Several rows report `status: "unknown"` rather than a number — this is
intentional (no fabricated data): web availability, submit-ack p95,
scoreboard staleness p95, and error rate all lack a real telemetry source
today. An `"unknown"` row never triggers an alert; only `"breach"` does.

### Judge availability (IE rate) breach

**What it means**: `getQueueStats().ieRatePercent` (submissions verdicted
`IE` in the last 5 minutes, as a percentage of all `DONE` submissions in that
window) is more than 1.5x the 0.5% target.

**How to confirm**: open `/admin/system` — the "SLOs" section shows the
current IE rate and status, and the Judge queue panel just above it shows the
same number plus the worker roster's `failedCount` per host.

**How to fix**: same remediation as the "`IE` rate > 1% over 5 minutes" entry
under Judge queue (Phase 4) above — identify whether it's one bad worker host
(check `failedCount` per row) or a systemic judge misconfiguration, fix the
underlying fault (sandbox image, compiler, judge backend config), then
rejudge anything permanently marked `FAILED`/`IE` via `/admin/rejudge`.

**How to verify**: `/admin/system`'s SLO row returns to `ok`/`warn` within a
few minutes of the fix (the underlying window is 5 minutes rolling, so a
fixed worker's next batch of judged submissions clears the rate quickly).

### Verdict p95 (idle or contest) breach

**What it means**: `src/lib/slo.ts`'s `verdictP95Ms()` — the 95th-percentile
`judgedAt - queuedAt` gap over `DONE` submissions in the last hour — exceeds
1.5x the target (3s idle / 20s contest).

**How to confirm**: check the Judge queue panel's "Oldest queued job" and
"Judged / min" stats alongside the SLO row's value — a high p95 with a high
oldest-queued-age and low throughput points at queue backpressure; a high
p95 with a low queue depth points at something slow inside the judge itself
(sandbox startup, compile time) rather than a backlog.

**How to fix**: if it's backpressure, this is the same fix as "Queue depth >
3x total concurrency for 2 minutes" above (add worker capacity — see the
pre-scaling section above for a contest specifically). If depth is low but
p95 is still high, check individual submissions' `compileMs`/`maxWallMs` in
`/admin/submissions/[id]` for a specific slow problem/language, and check
worker host resource pressure (CPU, disk, Docker daemon) directly.

**How to verify**: the SLO row recomputes from a live 1-hour rolling window,
so it self-clears as new, fast-judged submissions land after the fix — no
manual reset needed.

### DB query p95 breach

**What it means**: `src/lib/slo.ts` sampled 5 `SELECT 1` round trips just now
and their p95 exceeds 1.5x the 50ms target. This is a live sample, not a true
1-hour rolling window (nothing in the repo persists per-query latency history
yet) — treat a single breach reading with some skepticism and re-check
`/admin/system` a minute later before escalating.

**How to confirm**: reload `/admin/system` a few times — the page's own
top-of-page latency figure (`Neon PostgreSQL` check card) uses the same
`SELECT 1` pattern and should track the SLO row closely. Check Neon's own
dashboard for connection pool saturation or a concurrent heavy query
(migration, large export, `pg_dump`) running at the same time.

**How to fix**: if it's transient (a backup, an admin export, a burst of
contest-end snapshot writes), no action needed — it should clear on its own.
If it's sustained, check for a missing index on a newly hot query pattern, or
Neon compute/connection-pool sizing versus current concurrent load.

**How to verify**: `/admin/system` shows the SLO row back at `ok` on a
subsequent load once the transient load clears or the fix lands.

---

## Closing note

Every entry above exists because someone was going to be staring at a broken
page at 9pm the night before a midterm, with no time to read source code, and
needed to know three things fast: what's actually wrong, whether it's safe to
wait it out, and the smallest fix that gets students judging again. That's the
bar for every future addition to this file too — if an alert or failure mode
doesn't have a "symptom → cause → fix → verify" entry here yet, the runbook is
incomplete, not the incident. `docs/DR.md` covers the slower, worse nights
(losing infrastructure outright, working a restore drill); this file covers
the fast ones.
