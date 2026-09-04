# Submission table partitioning — deferred

Status: **NOT implemented.** This is a record of the trigger condition and the
design to use when the trigger fires, per `docs/phases/PHASE-13-scale-ops.md`
Part 1 ("Do this only when measured — under ~5M rows partitioning adds
operational complexity for no gain").

Current row count is nowhere near the trigger; nothing here should be applied
until it is.

## Trigger condition

Partition `Submission` once it crosses **~5M rows**. Check with:

```sql
SELECT count(*) FROM "Submission";
```

Do not partition earlier on a hunch — the phase doc is explicit that below
this size partitioning adds operational complexity (query planning quirks,
constraint/index maintenance per partition, migration risk) for no measurable
gain. Re-run the full integration suite against a partitioned copy of the
database before applying this to production, whenever it is eventually done.

## Why (once triggered)

- Contest and recent-practice queries hit one or two (recent) partitions
  instead of scanning the whole table.
- Old partitions can be detached and archived as a unit (pairs naturally with
  the payload offload in this same phase — `src/lib/submission-payload.ts`,
  `scripts/migrations/0007-archive-submission-payloads.ts`).
- `VACUUM` and index maintenance operate per partition instead of on one
  ever-growing table.

Prisma does not manage partitions natively — partitions are created with raw
SQL migrations, and Prisma continues to query the partitioned table
transparently (it just sees `Submission` as one table).

## Design: monthly partition by `createdAt`

Convert `Submission` to a partitioned table, range-partitioned by month on
`createdAt`:

```sql
-- One-time conversion (requires a maintenance window — rewriting the table).
-- Illustrative shape; the actual migration should be written against the
-- schema current at the time this is triggered, not copied verbatim years
-- later.
BEGIN;

ALTER TABLE "Submission" RENAME TO "Submission_old";

CREATE TABLE "Submission" (
  LIKE "Submission_old" INCLUDING ALL
) PARTITION BY RANGE ("createdAt");

-- Create partitions covering existing data plus a few months ahead.
CREATE TABLE "Submission_2026_09" PARTITION OF "Submission"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "Submission_2026_10" PARTITION OF "Submission"
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
-- ... one CREATE TABLE per historical month, generated from MIN(createdAt).

INSERT INTO "Submission" SELECT * FROM "Submission_old";

DROP TABLE "Submission_old";

COMMIT;
```

Notes:
- Every unique/foreign-key constraint that must hold across the whole table
  (e.g. `id` as primary key) needs `createdAt` included in it under native
  Postgres partitioning — verify this against the live schema before writing
  the real migration, since `Submission.id` alone as a global PK is not
  directly expressible on a partitioned table without a workaround
  (`UNIQUE (id, "createdAt")` or an ID scheme that encodes time).
- `SubmissionPayload`'s FK to `Submission.id` needs re-checking under the same
  constraint (Postgres requires a partitioned table's foreign keys to
  reference the full partition key or use a workaround).

## Monthly maintenance cron

A cron job pre-creates the next partition **three months ahead**, so a missed
run is never urgent:

```sql
-- Run monthly (e.g. via a new worker/src/*-tick.ts process, same shape as
-- the existing standings/leaderboard tick pattern).
CREATE TABLE IF NOT EXISTS "Submission_YYYY_MM" PARTITION OF "Submission"
  FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-(MM+1)-01');
```

Old partitions (older than the 90-day hot window plus a retention margin) can
be detached (`ALTER TABLE "Submission" DETACH PARTITION "Submission_YYYY_MM"`)
and archived or dropped once their rows are confirmed archived to blob storage
by the payload-offload backfill.

## What this does NOT cover

- The actual migration is not written or applied — only the shape is
  documented here.
- No cron process exists yet for partition pre-creation; the tick-process
  wiring is a follow-up once partitioning itself is triggered.
