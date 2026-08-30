# Phase 4 — Judge v2: Queue, Workers & Realtime

> **Execute with**: "execute Phase 4"
> **Effort**: 10–14 days · **Flag**: `judgeQueue`
> **Depends on**: Phase 3 · **Unblocks**: 5, 6, 7, 10 at contest scale

---

## Goal

Move judging off the HTTP request path. Introduce Redis, a BullMQ queue, a
standalone worker deployable, SSE verdict streaming, rejudge infrastructure, and
the operational visibility to run a 300-student exam without guessing.

## Why now

Today `POST /api/judge` blocks for the entire compile-and-run. On Vercel that
consumes a function invocation for seconds; on a self-hosted Node process it
occupies the event loop. Thirty simultaneous submitters during a lab quiz do not
degrade the judge — they degrade *the whole website*, including the scoreboard
the teacher is projecting.

This is the phase that turns a demo into infrastructure. It is also where the
deployment topology changes permanently: **judge workers cannot run on Vercel**
(no Docker daemon, no cgroups, no long-lived processes). Plan for a VPS.

## Scope

- Redis (Upstash or self-hosted) + BullMQ
- `worker/` — a standalone deployable consuming judge jobs
- Submission state machine with stalled-job recovery and exactly-once reporting
- SSE verdict streaming with polling fallback
- Priority queueing (contest > assignment > practice > anonymous)
- Rejudge: submission, problem, contest, with dry-run
- Redis-backed rate limiting (replacing Phase 0's in-memory driver)
- Queue observability: depth, latency, worker health, in `/admin/system`
- Load test at 200+ concurrent submitters

---

## Design decisions

### D1 — BullMQ on Redis, not a managed queue

One Redis instance serves the queue, the rate limiter, live scoreboard sorted
sets, and SSE pub/sub. A managed queue (SQS, Cloud Tasks) would need Redis
anyway for the other three. Rejected: a Postgres-backed queue — `SELECT … FOR
UPDATE SKIP LOCKED` works fine but puts the highest-write-rate workload on the
database that also serves the scoreboard, which is exactly the coupling this
phase exists to remove.

Redis holds **nothing that cannot be rebuilt from Postgres**. A total Redis loss
means: in-flight jobs are re-enqueued from `Submission.state = 'QUEUED'`, rate
limits reset (fail-open, briefly), scoreboards recompute. Documented in the
runbook as a 5-minute recovery, not an incident.

### D2 — The submission state machine

```
          enqueue                claim                  report
  QUEUED ──────────> QUEUED ──────────> JUDGING ──────────> DONE
     │                                     │
     │                                     ├── worker death / heartbeat timeout
     │                                     │        ↓
     │                                     └──> QUEUED (attempt + 1)
     │                                              │ attempts > 3
     │                                              ↓
     └───────────────────────────────────────────> FAILED (verdict = IE)
```

Columns: `state`, `attempts`, `claimedAt`, `claimedBy`, `heartbeatAt`.

**Claiming** is a conditional update, which is what makes it safe:

```sql
UPDATE "Submission"
   SET state = 'JUDGING', "claimedBy" = $worker, "claimedAt" = now(),
       "heartbeatAt" = now(), attempts = attempts + 1
 WHERE id = $id AND state IN ('QUEUED')
RETURNING *;
```

Zero rows returned means another worker won; the job is acked and dropped.

**Reporting** is likewise conditional on `state = 'JUDGING' AND claimedBy = $worker`,
which makes a duplicated report a no-op. This is the exactly-once property from
[Appendix C](../ULTIMATE_PLAN.md#appendix-c--judge-protocol-v1) — achieved without
distributed transactions, using the database that is already the source of truth.

A reaper (in the scheduler) re-queues rows with
`state = 'JUDGING' AND heartbeatAt < now() - interval '90 seconds'`.

### D3 — Priority classes

BullMQ priority (lower runs first):

| Priority | Class | Rationale |
|---|---|---|
| 0 | Live contest submission | A student staring at a clock |
| 5 | Assignment before its deadline | Time-sensitive but not by the second |
| 10 | Practice / archive, authenticated | Normal |
| 15 | Rejudge batches | Bulk, never at a user's expense |
| 20 | Anonymous run | Best-effort; the free tier |

Additionally: **per-user fairness**. A student who queues 15 submissions must not
starve 15 other students. Enforce with a per-user in-flight cap of 2 (BullMQ
group concurrency or a Redis counter checked at claim time). This is the single
most important scheduling property during a contest and it is easy to forget.

### D4 — SSE, not WebSockets

The client subscribes to `/api/submissions/[id]/stream`; the route subscribes to
a Redis channel and forwards `PENDING → JUDGING → per-test progress → final`.

Why SSE: unidirectional, plain HTTP, passes through the existing auth middleware,
degrades to polling with no code change on the server. Rejected: WebSockets
(needs a separate connection path and does not work on Vercel functions),
Pusher/Ably (a paid dependency for something Redis already does).

**Vercel caveat**: streaming responses have a duration cap. The client reconnects
with `Last-Event-ID`; the server replays from a short Redis stream. If SSE proves
unreliable in production, the fallback is a 1-second poll of
`GET /api/submissions/[id]` — implemented from day one and used automatically
after two failed SSE connections.

Per-test progress ("test 7/20 passed") is worth streaming. It is the difference
between a spinner and a student who can see the judge working.

### D5 — Rejudge is a first-class, auditable operation

Not a script. A `RejudgeBatch` row, a queue of jobs at priority 15, and a
**dry-run mode** that judges into a shadow column and produces a diff before
anything is committed.

A teacher who fixes test 7 needs to answer: "how many students' verdicts change,
and whose scores go up or down?" — *before* deciding. That report is the feature.

---

## Architecture

```
┌──────────────── Vercel ────────────────┐   ┌──────── VPS (Hetzner CX32) ────────┐
│  Next.js                               │   │  worker/                            │
│   POST /api/judge                      │   │   index.ts   — BullMQ Worker        │
│     → validate, authz, rate limit      │   │   claim.ts   — conditional claim    │
│     → create Submission (QUEUED)       │   │   report.ts  — conditional report   │
│     → queue.add(job, {priority})       │   │   heartbeat.ts                      │
│     → 202 { submissionId }             │   │   → src/lib/judge/engine (Phase 3)  │
│                                        │   │   → Docker sandbox pool             │
│   GET /api/submissions/[id]/stream     │   └────────────┬───────────────────────┘
│     → redis.subscribe(sub:{id})        │                │
└──────────────────┬─────────────────────┘                │
                   │                                      │
                   └──────── Redis (Upstash) ─────────────┘
                        queues · pub/sub · ratelimit · boards
```

The worker imports the judge engine directly from `src/lib/judge/` — one
implementation, two entry points. A shared `tsconfig` path and a small build step
(`tsup` or `tsc` to `worker/dist`) keeps it a single codebase, not a copy.

### Worker deployment

`worker/Dockerfile` (the worker itself, not the sandbox) plus a
`docker-compose.yml` for the VPS running: the worker, a Redis (if self-hosted),
and a Watchtower-style updater. Workers need `/var/run/docker.sock` mounted — the
worker container orchestrates sibling sandbox containers rather than nesting
Docker in Docker, which is both faster and less privileged.

**Security note**: mounting the Docker socket grants root-equivalent access on the
host. Therefore the worker VPS runs **nothing else** — no web app, no database, no
secrets beyond `REDIS_URL`, `DATABASE_URL` (a restricted role) and
`JUDGE_SHARED_SECRET`. Document this in the runbook; it is a real constraint, not
a nicety.

The worker's database role has `SELECT` on problems/tests and `UPDATE` on
`Submission` only — not `DELETE`, not access to `User.passwordHash`. Create it in
this phase.

---

## Schema changes

```prisma
enum SubmissionState {
  QUEUED
  JUDGING
  DONE
  FAILED
}

model Submission {
  // ...existing
  state       SubmissionState @default(DONE)  // existing rows are already done
  priority    Int             @default(10)
  attempts    Int             @default(0)
  claimedAt   DateTime?
  claimedBy   String?
  heartbeatAt DateTime?
  queuedAt    DateTime?
  judgedAt    DateTime?
  /// Set when this submission is part of a rejudge batch.
  rejudgeBatchId String?
  /// Dry-run rejudge result, not applied to `verdict`.
  shadowReport   Json?

  rejudgeBatch RejudgeBatch? @relation(fields: [rejudgeBatchId], references: [id], onDelete: SetNull)

  @@index([state, priority, queuedAt])
  @@index([state, heartbeatAt])
}

model RejudgeBatch {
  id           String   @id @default(cuid())
  scope        String   // "submission" | "problem" | "contest" | "version"
  scopeId      String
  reason       String
  dryRun       Boolean  @default(true)
  createdById  String
  total        Int      @default(0)
  completed    Int      @default(0)
  changed      Int      @default(0)
  /// Verdict transition counts: { "WA->AC": 12, "AC->WA": 1 }
  diffSummary  Json     @default("{}")
  appliedAt    DateTime?
  createdAt    DateTime @default(now())

  submissions  Submission[]
  createdBy    User @relation(fields: [createdById], references: [id])

  @@index([scope, scopeId])
}

model JudgeWorker {
  id           String   @id            // stable worker id from config
  hostname     String
  languages    String[]
  concurrency  Int
  version      String
  startedAt    DateTime
  lastSeenAt   DateTime
  judgedCount  Int      @default(0)
  failedCount  Int      @default(0)

  @@index([lastSeenAt])
}
```

Migration `0011_judge_queue`: expand only. `state` defaults to `DONE` so every
existing row is correct without a backfill — the one place where choosing the
right default eliminates a migration step entirely.

---

## API contracts

| Method | Path | Auth | Behaviour |
|---|---|---|---|
| `POST` | `/api/judge` | session (submit) / rate-limited (run) | **Changed**: creates a `QUEUED` submission, enqueues, returns `202 { submissionId, state }` in ≤150 ms |
| `GET` | `/api/submissions/[id]` | owner / staff | Current state + report (polling fallback) |
| `GET` | `/api/submissions/[id]/stream` | owner / staff | SSE: `state`, `progress`, `result` events |
| `POST` | `/api/teacher/rejudge` | teacher/admin | `{ scope, scopeId, reason, dryRun }` → batch id |
| `GET` | `/api/teacher/rejudge/[id]` | creator/admin | Progress + diff summary |
| `POST` | `/api/teacher/rejudge/[id]/apply` | creator/admin | Commits a dry run's shadow results |
| `GET` | `/api/admin/queue` | admin | Depth by priority, oldest job age, worker roster, throughput |
| `POST` | `/api/admin/queue/drain` | admin | Pause/resume intake (maintenance) |
| `POST` | `/api/internal/judge/report` | HMAC | Worker → web report ingestion, when the worker cannot reach Postgres directly |

The direct-Postgres write from the worker is the primary path; the HMAC endpoint
exists as a fallback for a network topology where the worker has Redis but not
database access. Implement both — the endpoint is 40 lines and it removes a hard
deployment constraint.

### SSE event shape

```
event: state
data: {"state":"JUDGING","attempt":1}

event: progress
data: {"group":1,"test":7,"of":20,"verdict":"AC","cpuMs":142}

event: result
data: {"verdict":"PA","score":30,"maxScore":100,"maxCpuMs":1840,"maxMemoryKb":9200}
```

---

## Rate limiting on Redis

Swap `src/lib/ratelimit.ts`'s driver from the Phase 0 in-memory map to a Redis
sliding-window implemented as a single Lua script (atomic, one round trip). Same
interface, same buckets, no call-site changes — the Phase 0 abstraction pays off
here.

Add the global anonymous concurrency counter as a Redis key with a TTL-guarded
increment/decrement, replacing the in-process semaphore.

---

## Observability

This phase is where the platform becomes operable. `/admin/system` gains a
**Judge** panel:

| Metric | Why it matters |
|---|---|
| Queue depth by priority | The single number that predicts a bad contest |
| Oldest queued job age | Detects starvation that depth alone hides |
| Judging throughput (subs/min, 1/5/15 min) | Capacity planning |
| p50/p95/p99 queue wait and judge duration | SLO tracking (Appendix F) |
| Worker roster: id, languages, in-flight, last heartbeat | Which box died |
| `IE` rate | Infrastructure health; alert above 0.5% |
| Stalled/re-queued count | Silent worker failures |
| Sandbox pool: warm containers, recycles, orphans reaped | Leak detection |

Alerts (Sentry or a simple cron → email/Telegram):

- Queue depth > 3× total concurrency for 2 minutes
- Oldest job age > 60 s
- Any worker heartbeat stale > 2 minutes
- `IE` rate > 1% over 5 minutes

Add `docs/RUNBOOK.md` entries for each alert with the diagnosis and the fix.

---

## Frontend changes

| Component | Work |
|---|---|
| `components/ProblemWorkspace.tsx` | Submit returns immediately; show queued → judging → per-test progress → verdict. Keep the existing `AcceptedCelebration` trigger on the final `AC`. |
| `components/SubmissionStatus.tsx` *(new)* | SSE hook with automatic polling fallback and reconnect |
| `components/contest/ContestDashboard.tsx` | Pending submissions render as a pulsing cell, not as absent |
| `app/profile/submissions/page.tsx` | `QUEUED`/`JUDGING` states; auto-refresh while any are pending |
| `app/admin/system/page.tsx` | Judge panel above |
| `app/teacher/rejudge/[id]/page.tsx` *(new)* | Dry-run diff table: student × problem × old → new verdict, with an Apply button |

The progress stream materially changes perceived latency. A student watching
"test 12/20" is not refreshing the page; a student watching a spinner is.

---

## Load testing

A first-class deliverable of this phase, not an afterthought.
`scripts/loadtest/contest.ts` (k6 or a plain Node driver):

| Scenario | Shape | Pass condition |
|---|---|---|
| **Lab quiz** | 60 users, 1 submission each within 60 s, 10 tests | p95 verdict ≤ 15 s, zero `IE` |
| **Midterm** | 200 users, 3 submissions each over 10 min | p95 ≤ 25 s, queue drains within 60 s of the last submission |
| **Contest burst** | 300 submissions in 30 s (the classic last-minute rush) | No web request > 500 ms; no dropped jobs |
| **Fairness** | 1 user submits 20, 20 users submit 1 | The 20 single-submitters are not starved; their p95 ≤ 2× baseline |
| **Worker death** | Kill a worker mid-contest | All in-flight jobs re-queue and complete; zero lost submissions |
| **Redis restart** | Restart Redis mid-contest | Queue rebuilds from `state = 'QUEUED'`; zero lost submissions |

Record the measured numbers in `docs/CAPACITY.md` with the host spec, so
"how many workers for a 300-student exam" has a data-backed answer instead of a
guess.

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | Claim is atomic — two concurrent claims, exactly one wins |
| Unit | Report is idempotent — replaying a report leaves the row unchanged |
| Unit | Priority assignment from submission context |
| Unit | Per-user in-flight cap blocks a 3rd concurrent job |
| Integration | Submit → 202 in < 150 ms → poll → terminal state |
| Integration | Kill the worker mid-judge → reaper re-queues → completes on attempt 2 |
| Integration | 4 failed attempts → `FAILED` with verdict `IE`, not counted as an attempt in scoring |
| Integration | SSE delivers state, progress and result in order; reconnect with `Last-Event-ID` replays |
| Integration | Rejudge dry-run produces a diff and changes no verdict until applied |
| Load | All six scenarios above |
| Chaos | Redis unavailable → submit returns a clear 503, no data loss, recovery on reconnect |

---

## Acceptance criteria

1. `POST /api/judge` returns in ≤ 150 ms p95 and never blocks on judging.
2. 200 simultaneous submissions complete with zero losses and zero `IE`; the web
   app's p95 response time is unchanged from idle.
3. Killing a worker mid-contest loses no submissions.
4. A student sees per-test progress within 2 s of submitting.
5. A teacher can rejudge one problem across a contest, see exactly whose verdict
   changes, and apply or discard.
6. `/admin/system` answers "is the judge healthy right now" in one screen.
7. One student flooding the queue does not delay other students.
8. `docs/CAPACITY.md` states the measured submissions-per-minute per worker and
   the worker count for a 300-student exam.

## Rollback

`judgeQueue` off routes `/api/judge` back to synchronous Phase 3 judging. Queued
submissions already in flight are drained by the workers first — the flag gates
*enqueueing*, not *consuming*, so no work is stranded. Order matters: flip the
flag, wait for depth to reach zero, then stop workers.

## Risks

| Risk | Mitigation |
|---|---|
| New infrastructure (Redis + VPS) introduces new outages | Redis holds nothing authoritative; documented 5-minute rebuild. Worker VPS failure degrades to "submissions queue up", not "site down". |
| Docker socket on the worker host is root-equivalent | Worker VPS is single-purpose; restricted DB role; no other services; documented |
| SSE unreliable behind Vercel/CDN | Polling fallback implemented from day one and exercised in tests |
| Queue backs up silently during an exam | Depth and oldest-age alerts; `/admin/queue` visible to admins during contests |
| Cost of an always-on worker | ~$8/month for a CX32; far cheaper than the Vercel function time it replaces |
| Worker and web drift to different judge versions | Worker reports `judgeImage` and engine version on every submission; `/admin/system` flags a mismatch |
| Rejudge accidentally applied to a live contest | Rejudge on a `LIVE` contest requires an explicit confirmation naming the contest, and is blocked entirely in the final 15 minutes |

## Definition of done

- [ ] Redis provisioned; BullMQ queues live
- [ ] `worker/` deployable running on a VPS with a restricted DB role
- [ ] Submission state machine with claim/report/heartbeat/reaper
- [ ] Priority classes + per-user fairness cap
- [ ] SSE streaming with polling fallback and reconnect
- [ ] Rate limiter on Redis; anonymous concurrency capped globally
- [ ] Rejudge with dry-run diff and apply
- [ ] `/admin/system` judge panel + four alerts + runbook entries
- [ ] Six load scenarios passing; `docs/CAPACITY.md` written
- [ ] Deployment documented in `docs/DEPLOYMENT.md` including the worker VPS
