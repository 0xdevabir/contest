# Disaster recovery

Phase 13 Part 6. This document is the "what do I do right now" reference for
losing an asset the platform depends on. It complements `docs/RUNBOOK.md`
(day-to-day alert diagnosis) — DR is for the assets, RUNBOOK is for the
symptoms.

None of the scenarios below have been drilled against real infrastructure yet
(no Neon/R2/Hetzner/Telegram credentials exist in this environment). The
scripts and procedures are ready to use; `docs/DR-DRILL.md` tracks when they
actually get exercised.

## Asset / backup / RPO / RTO table

| Asset | Backup | RPO | RTO |
|---|---|---|---|
| Postgres (Neon) | Neon PITR (7 days on paid tiers) + nightly `pg_dump` to R2 (`scripts/backup-nightly.sh`), retained 30 days | 5 min (PITR) | 1 h |
| Test data / statement assets (R2) | R2 object versioning + weekly cross-bucket copy (documented here, not yet automated — no R2 bucket provisioned) | 24 h | 2 h |
| Submission archives (Phase 13 Part 1 payload offload, R2) | R2 object versioning | 24 h | 4 h |
| Redis (queue, cache, rate limits) | None — every value is reconstructible from Postgres (`isEnabled`'s DB fallback, `LeaderboardCache`, live standings recompute) | n/a | 5 min (empty Redis, rebuild on first read/tick) |
| Application code | Git + tagged releases (GitHub) | 0 | 15 min (redeploy last known-good tag) |
| Secrets (`AUTH_SECRET`, `DATABASE_URL`, SMTP, R2, Hetzner, Telegram keys) | Encrypted vault (e.g. 1Password/Bitwarden vault item), offline copy held by two people | 0 | 30 min |

RPO/RTO figures above are targets from the approved plan, not measured
numbers — the first restore drill (`docs/DR-DRILL.md`) will confirm or correct
the Postgres row in particular.

## Read replica for analytics — deferred, wiring point documented

The approved plan defers provisioning a Neon read replica for analytics-only
queries (it needs a second Neon branch/connection the project hasn't
provisioned). The wiring point for when it is provisioned:

- Env var: `ANALYTICS_DATABASE_URL` (see `.env.example`, currently commented
  out with this explanation).
- When set, analytics-only read paths (`/admin/analytics`, `/admin/costs`'s
  `prisma.user.count()`/`prisma.submission.count()`, any future reporting
  query) would construct a second `PrismaClient` pointed at it, following the
  same singleton pattern as `src/lib/db.ts`'s `prisma` export — e.g. a
  `prismaAnalytics` export in a new `src/lib/db-analytics.ts` that falls back
  to the primary `prisma` client when `ANALYTICS_DATABASE_URL` is unset, so
  every analytics call site works unmodified before and after the replica
  exists.
- Do not point write paths at it — a replica lags primary by design, and using
  it for anything that gates on freshly-written data (submission state,
  contest registration) will produce visibly wrong behavior.

## Decision trees

Each scenario: **detect → contain → recover → verify**.

### 1. Neon (Postgres) outage

**Detect**: `/admin/system`'s DB latency check fails or times out; `SELECT 1`
health check errors; app-wide 500s on any DB-touching route.

**Contain**: confirm it's Neon-side, not a local config/network issue — check
[Neon's status page] and try `psql "$DIRECT_URL" -c 'select 1'` from a
separate network. If Neon confirms an incident, there is nothing to "contain"
on our side beyond communicating downtime (status banner, Telegram alert via
`worker/src/slo-alert-tick.ts` if the SLO check fires first).

**Recover**: wait for Neon to restore service (their SLA governs this, not
ours) — Postgres-as-a-service outages are not something a nightly `pg_dump`
fixes faster than the provider's own recovery. If the outage is prolonged
enough to justify a full provider migration, the last nightly `pg_dump` in R2
plus Neon PITR (7-day window) are both viable restore sources into a new Neon
project or any Postgres 15+ host — use `scripts/migrations/dr-restore-drill.ts`
as the restore procedure, pointed at the new target.

**Verify**: `/admin/system` DB latency check green; run `npm run test` against
production data shape once (staging/scratch branch, never against prod
directly) to confirm nothing silently broke.

### 2. Worker host loss (judge VPS dies)

**Detect**: `/admin/system` worker roster shows all workers stale (per
RUNBOOK's "Any worker heartbeat stale > 2 minutes" entry); queue depth climbs
with no throughput.

**Contain**: in-flight submissions self-heal via the reaper
(`src/lib/queue/reaper.ts`) within ~90s of last heartbeat — no data loss, just
delay. No further containment needed; the queue is durable in Redis/Postgres
independent of any one worker host.

**Recover**: provision a replacement VPS (manual, or via the Part 4
`HETZNER_API_TOKEN` autoscaler if configured), deploy `worker/` there with the
same `DATABASE_URL`/`REDIS_URL`, start it. If `HETZNER_API_TOKEN` and
`HETZNER_MAX_WORKERS` are set, `src/lib/autoscale.ts`'s controller will
provision a replacement automatically on the next tick once queue depth
crosses its scale-up threshold; otherwise this is the manual pre-scaling
procedure documented in `docs/RUNBOOK.md`.

**Verify**: new worker appears in the `/admin/system` roster with a fresh
`lastSeenAt`; queue depth drains; submit a canary submission end-to-end.

### 3. Redis loss (mid-contest)

**Detect**: `/admin/system`'s "Redis up/down" badge goes red; queue depth
panel disappears (judge queue read requires Redis); live standings stop
updating.

**Contain**: nothing to contain — by design, Redis holds no data that isn't
reconstructible from Postgres. The judge route's documented behavior when the
flag is on and Redis is unreachable is a clear 503 (not silent fallback), so
submitters see an honest error rather than a black hole.

**Recover**: restart/replace the Redis instance (Upstash: this is provider-
managed; self-hosted: restart the process/container). Once Redis is back:
queue consumers reconnect automatically (BullMQ/ioredis retry); the standings
Redis read model rebuilds on the next `standings-tick` cycle or first read;
`LeaderboardCache` rebuilds on its next hourly tick or on-demand recompute.

**Verify**: `/admin/system` Redis badge green; submit a canary submission and
confirm it queues and judges; confirm live standings for an active contest
show current data within one tick interval.

### 4. R2 (object storage) outage

**Detect**: `blobHealthCheck()` in `/admin/system` fails; teacher problem
uploads or archived-submission reads (Part 1 payload offload) error.

**Contain**: new writes that would go to blob storage (test data uploads,
submission payload archival past the 90-day window) fail loudly — this is
preferable to silent data loss. The 90-day *hot* window (`SubmissionPayload`
rows, not yet archived) is unaffected, since those reads never touch R2.

**Recover**: wait for Cloudflare R2 to restore service, or fail over to a
different S3-compatible endpoint if one is pre-provisioned (not currently the
case — single-bucket setup). `src/lib/blob.ts`'s `getBlobStore()` driver
selection (`BLOB_DRIVER=s3` vs the local `fs` driver) means a genuinely
prolonged outage could be worked around in a pinch by pointing a *non-
production* deployment at the `fs` driver temporarily — never do this in
production, since the fs driver is not durable across deploys.

**Verify**: `blobHealthCheck()` passes (put → get → delete round trip); a test
data upload and an archived-submission read both succeed.

### 5. Bad migration in production

**Detect**: deploy fails a health check; `/admin/system` DB checks error;
error rate spikes immediately after a deploy that included a `prisma migrate
deploy` step.

**Contain**: **do not run `prisma migrate reset`** — see the ledger-drift
gotcha in `docs/RUNBOOK.md`'s Phase 2 section for what that destroys. Stop
further deploys immediately. If the migration is additive (the expand step of
expand→backfill→contract, which is this repo's own discipline per
`docs/ULTIMATE_PLAN.md` Appendix G), the old application code usually still
runs against the new schema — the safest first move is often to roll the
*application* deploy back to the previous tag while leaving the schema as-is.

**Recover**: for a destructive/incompatible migration, restore from the most
recent Neon PITR point *before* the migration ran (Neon console, "restore to
point in time"), or restore the last nightly `pg_dump` if PITR isn't
available/sufficient. Never attempt to hand-write a reverse migration under
pressure — restore, then re-plan the forward migration properly (this is
exactly why the Submission contract migration — Part 1 — is a manual,
one-time script run only after backfill reconciliation, never an auto-run
migration file).

**Verify**: `npm run test` green against the restored database; `/admin/system`
checks green; spot-check a few recently-modified rows for the affected table.

### 6. Compromised API key (Phase 12 platform API keys, or a provider key like R2/Hetzner/SMTP)

**Detect**: unexpected usage pattern in `AdminAuditLog` / provider-side usage
dashboards (Neon, R2, Hetzner billing spike); a leaked-secret alert (GitHub
secret scanning, or manual discovery).

**Contain**: revoke the specific key immediately — platform API keys have a
revoke path in `/admin` (Phase 12); provider keys (R2 access key, Hetzner
token, SMTP password) are rotated from that provider's console. Rotating one
key never requires rotating `AUTH_SECRET` (session signing is independent).

**Recover**: issue a new key/credential, update the relevant env var
(`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, `HETZNER_API_TOKEN`,
`SMTP_PASS`, or a regenerated platform API key), redeploy so the new value is
live. Audit `AdminAuditLog` and provider logs for the exposure window to scope
what the compromised key could have touched.

**Verify**: old key confirmed revoked (a request using it fails); new key
confirmed working (`blobHealthCheck()` for R2, a test email send for SMTP,
etc.); no further anomalous usage after rotation.

### 7. Compromised worker host

**Detect**: unexpected process/network activity on a judge VPS; a judge
sandbox escape or unexpected outbound connection reported by host-level
monitoring; unexplained submissions or verdicts inconsistent with the judge
engine's expected behavior.

**Contain**: pull the host's `DATABASE_URL`/`REDIS_URL` credentials
immediately (rotate the `judge_worker` restricted DB role's password — see
`worker/README.md` — and the Redis credential if per-host); take the host
offline (stop the process, or destroy the VPS instance via the provider
console/API). Its in-flight jobs self-heal via the reaper on the remaining
workers, same as scenario 2.

**Recover**: provision a clean replacement host from the known-good worker
image/deploy script — never reuse the compromised disk. Audit
`Submission.judgeImage`/`judgeProtocol` and verdicts produced by the
compromised host's worker id for the exposure window; consider a targeted
rejudge (`/admin/rejudge`) of anything it judged if sandbox integrity is in
doubt.

**Verify**: replacement worker appears healthy in the `/admin/system` roster;
no further anomalous activity; rotated credentials confirmed working end to
end with a canary submission.

[Neon's status page]: https://neonstatus.com/
