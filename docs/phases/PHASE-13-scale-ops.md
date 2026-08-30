# Phase 13 — Scale, Performance & Operations

> **Execute with**: "execute Phase 13"
> **Effort**: 10–14 days · **Flag**: per-optimisation flags
> **Depends on**: Phase 4, 5 · **Ongoing from Phase 0, formalised here**

---

## Goal

Make the platform fast at 25,000 users and operable by one person: read models,
caching, the `Submission` table restructure, autoscaling workers, full-text
search, SLO monitoring, backups with a tested restore, and a runbook that answers
the questions that actually come up at 9pm before a midterm.

## Why now

Budgets were defined in Phase 0 and enforced in CI since then. The structural
work — partitioning, payload offload, read models — only pays off at real volume
and can only be validated against real query patterns, which exist once Phases
5–9 are running.

## Scope

- `Submission` restructure: payload offload + partitioning
- Read models and caching strategy
- Postgres full-text search across problems, contests, users
- Worker autoscaling on queue depth
- Read replica for analytics
- SLO dashboard + alerting
- Backup, restore drill, and disaster recovery documentation
- Cost telemetry
- Runbook completion

---

## Part 1 — The `Submission` table

The largest and hottest table. At 25k users it reaches roughly 5–10 million rows,
and today each row carries `code`, `stdout`, `stderr` and (since Phase 0)
`report` inline.

### Problem

A 4 KB average payload across 10M rows is ~40 GB in the primary table. Every
sequential scan, every `count(*)`, every analytics aggregation and every
`VACUUM` drags it through memory. Postgres TOASTs large values, which helps, but
the row-level bloat still hurts index-only scans and increases replication lag.

### Fix — offload the payload

```prisma
model Submission {
  // hot columns only: ids, verdict, score, timings, timestamps, state
  // code / stdout / stderr / report move out
  payloadKey String?     // blob storage key for the source
}

model SubmissionPayload {
  submissionId String @id
  code         String
  stdout       String?
  stderr       String?
  report       Json?

  submission Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
}
```

Two-tier: recent payloads (90 days) in `SubmissionPayload`; older ones archived to
object storage as gzipped JSON and the row deleted, with `payloadKey` set. Reads
fall back to blob storage transparently. Source code compresses ~5:1, so archived
storage is a few GB at R2's $0.015/GB.

Migration: expand (`SubmissionPayload` + `payloadKey`) → backfill in batches of
1000 during low traffic → contract (drop the four columns from `Submission`).

**The contract step rewrites the table.** On Postgres 11+ dropping a column is
metadata-only and fast; the space is reclaimed lazily by `VACUUM`. Plan the
`VACUUM FULL` (or `pg_repack`) for a maintenance window, or skip it and let
autovacuum reclaim over time. Document which you chose.

### Partitioning

Once past ~5M rows, partition `Submission` by month on `createdAt`:

- Contest and recent-practice queries hit one or two partitions.
- Old partitions can be detached and archived whole.
- `VACUUM` and index maintenance operate per partition.

Prisma does not manage partitions; create them with raw SQL migrations and a
monthly cron that pre-creates the next partition (three months ahead, so a
failure is never urgent). Prisma queries partitioned tables transparently.

**Do this only when measured** — under ~5M rows partitioning adds operational
complexity for no gain. The trigger condition and the migration are both defined
here so that when the number is hit, the work is already specified.

---

## Part 2 — Read models and caching

| Data | Strategy | Invalidation |
|---|---|---|
| Problem statement HTML | Rendered once per immutable `ProblemVersion`, cached in Redis and in Next.js `unstable_cache` | Never (version is immutable) |
| Problem list / archive | ISR, 60 s | On publish |
| Live contest standings | Redis read model (Phase 7) | Debounced on judged submission |
| Finished contest standings | `ContestStandingSnapshot` | Never (new version on rejudge) |
| Practice leaderboard | Materialised hourly into `LeaderboardCache` | Hourly + on demand |
| National leaderboard | Same, plus a Redis zset for rank lookups | Hourly |
| Gradebook | Per-section Redis cache, 5 min | On submission in the section, on override |
| User profile stats | `UserStat` rollup (Phase 8) | Nightly + on AC |
| Institution counters | Nightly job | Nightly |
| Session | In-process LRU, 60 s | On revoke |

```prisma
model LeaderboardCache {
  key       String   @id          // "national:rating:alltime" | "inst:diu:solved:30d"
  payload   Json
  computedAt DateTime @default(now())
  @@index([computedAt])
}
```

**Cache rule**: every cached value must be reconstructible from Postgres, and
every cache read must have a working miss path exercised by a test. A cache whose
miss path is broken is a latent outage.

---

## Part 3 — Search

Postgres full-text, not a search service (Master Plan ADR-14).

```sql
ALTER TABLE "Problem" ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple',  coalesce(slug,'')),  'B')
  ) STORED;
CREATE INDEX problem_search_idx ON "Problem" USING GIN (search_vector);
```

Statement text is searched via a separate indexed column on `ProblemVersion`
(only the current version, maintained by a trigger).

Bangla search: `to_tsvector('simple', ...)` handles Bangla tokens acceptably
(no stemming, but Bangla stemming is not available in core Postgres and is not
worth a custom dictionary at this scale). Add a trigram index (`pg_trgm`) for
fuzzy title matching, which covers transliteration and typos better than stemming
would.

Global search across problems, contests, users and editorials: one endpoint,
`UNION ALL` over per-entity ranked queries with a type tag, `LIMIT` per type.

---

## Part 4 — Worker autoscaling

Judge load is spiky: a 300-student midterm needs ten minutes of capacity per
week. Options, in increasing order of complexity:

1. **Manual pre-scaling** (start here): a documented procedure and an admin UI
   showing scheduled contests with expected participants, so someone can add
   workers before a big exam. Covers 90% of cases at zero engineering cost.
2. **Queue-depth autoscaling**: a small controller polling queue depth and
   starting/stopping VPS instances via the provider API (Hetzner Cloud API is
   straightforward). Scale up at depth > 2× capacity for 60 s; scale down after
   10 minutes below 0.5×. Cooldowns to prevent flapping.
3. **Burst to a serverless sandbox** — rejected: no Docker, no cgroups.

Implement 1 in this phase and 2 behind a flag. Include a **contest-aware
pre-warm**: the lifecycle tick starts extra workers 15 minutes before a contest
with more than 50 registrants. That single heuristic beats reactive autoscaling
for the workload that actually matters, because it scales *before* the spike
rather than during it.

---

## Part 5 — Observability and SLOs

Formalise the [Appendix F](../ULTIMATE_PLAN.md#appendix-f--performance-budgets--slos)
budgets as monitored SLOs.

| SLO | Target | Window | Alert |
|---|---|---|---|
| Web availability | 99.9% | 30 d | Page |
| Judge availability (`IE` rate) | < 0.5% | 7 d | Page |
| Submit acknowledgement p95 | < 150 ms | 1 h | Warn |
| Verdict p95 (idle) | < 3 s | 1 h | Warn |
| Verdict p95 (contest) | < 20 s | live | Page during a contest |
| Scoreboard staleness p95 | < 5 s | live | Warn |
| DB query p95 | < 50 ms | 1 h | Warn |
| Error rate | < 0.1% | 1 h | Warn |

`/admin/system` becomes the operational dashboard: SLO status, queue, workers,
DB connections and slow queries, cache hit rates, blob storage health, recent
errors, and cost-to-date.

Alerting: Sentry for errors; a cron-based checker for SLOs posting to email and a
Telegram/Discord webhook. Telegram is the right channel for this audience — it is
where a Bangladeshi dev team already is at 9pm.

Every alert gets a runbook entry with: what it means, how to confirm, how to fix,
and how to verify the fix.

---

## Part 6 — Backup and disaster recovery

| Asset | Backup | RPO | RTO |
|---|---|---|---|
| Postgres | Neon PITR (7 d on paid tiers) + a nightly `pg_dump` to R2, retained 30 d | 5 min | 1 h |
| Test data / statement assets (R2) | R2 object versioning + weekly cross-bucket copy | 24 h | 2 h |
| Submission archives | R2 versioning | 24 h | 4 h |
| Redis | None — rebuilt from Postgres | n/a | 5 min |
| Application code | Git + tagged releases | 0 | 15 min |
| Secrets | Encrypted vault, offline copy held by two people | 0 | 30 min |

**Run a restore drill.** Quarterly, restore the nightly dump into a scratch
database, run the integration suite against it, and record the elapsed time in
`docs/DR-DRILL.md`. A backup that has never been restored is a hypothesis, not a
backup. The first drill will find something broken; that is the point.

DR scenarios documented with a decision tree: Neon outage, worker host loss,
Redis loss, R2 outage, a bad migration in production, a compromised API key, and
a compromised worker host.

---

## Part 7 — Cost telemetry

`/admin/costs`: month-to-date per component (Vercel, Neon, Upstash, R2, VPS),
against the Master Plan's [cost model](../ULTIMATE_PLAN.md#appendix-i--cost-model),
with a per-1000-submissions unit cost. When someone eventually asks "what does
this cost the department per semester", the answer should be a screenshot.

---

## Testing plan

| Tier | Test |
|---|---|
| Migration | Payload offload backfill is idempotent and resumable; reads fall back to blob storage correctly |
| Migration | Partition creation cron pre-creates months; queries span partitions correctly |
| Unit | Every cache has an exercised miss path |
| Unit | Search ranking: exact title beats partial; Bangla query returns Bangla titles; trigram catches a typo |
| Load | 25k-user leaderboard p95 < 300 ms |
| Load | 10M-row submissions table: profile page, contest standings, analytics all within budget |
| Load | Autoscaling adds a worker within 90 s of sustained depth and removes it after cooldown |
| Chaos | Redis loss during a contest: standings rebuild, no data loss |
| Chaos | Worker host loss: jobs re-queue and complete |
| DR | Quarterly restore drill with the suite green against the restored database |

Generating a realistic 10M-row dataset is a deliverable of this phase —
`scripts/seed-load.ts` producing statistically plausible submissions (verdict
distribution, temporal clustering around contests, per-user activity following a
power law). Testing against uniformly random data measures the wrong thing.

---

## Acceptance criteria

1. `Submission` carries no payload columns; archived payloads read transparently
   from blob storage.
2. With 10M submissions, every page in Appendix F meets its budget.
3. Full-text search returns relevant results for English and Bangla queries in
   under 200 ms.
4. Workers pre-warm 15 minutes before a large contest without human action.
5. `/admin/system` shows every SLO's current status, and every alert has a
   runbook entry.
6. A restore drill has been performed and documented, with the suite green
   against the restored database.
7. Redis can be wiped during a live contest with no data loss and recovery inside
   5 minutes.
8. `/admin/costs` reports month-to-date spend and cost per 1000 submissions.

## Rollback

Each optimisation has its own flag. The payload offload is the only irreversible
step (the contract migration); it ships alone, after the backfill reconciles
clean, with a fresh Neon branch taken first.

## Risks

| Risk | Mitigation |
|---|---|
| The payload backfill saturates the database | Batched at 1000, rate-limited, off-peak, resumable, monitored |
| Partitioning breaks a Prisma query | Only partition after measuring the need; full integration suite against a partitioned copy first |
| Cache staleness shows wrong grades or standings | Short TTLs on anything grade-related; event invalidation; every cached value labelled with `computedAt` in the UI where it matters |
| Autoscaling flaps or runs up cost | Cooldowns, a hard maximum instance count, a cost alert at 150% of the monthly model |
| Restore drill reveals an unrecoverable gap | That is the drill working; schedule the first one early in the phase, not at the end |
| Search relevance is poor for Bangla | Trigram fallback; measured against a hand-labelled query set |

## Definition of done

- [ ] Submission payloads offloaded; 90-day hot window; transparent archive reads
- [ ] Partitioning implemented (or explicitly deferred with the trigger condition recorded)
- [ ] Read models and caches for every hot path, each with a tested miss path
- [ ] Postgres FTS + trigram search across four entity types, English and Bangla
- [ ] Contest-aware worker pre-warm; queue-depth autoscaling behind a flag
- [ ] SLO dashboard + alerting to email and Telegram
- [ ] Backups configured; one restore drill completed and documented
- [ ] `docs/RUNBOOK.md` complete: one entry per alert; `docs/DR.md` with scenarios
- [ ] `/admin/costs` live
- [ ] `scripts/seed-load.ts` producing a realistic 10M-row dataset
