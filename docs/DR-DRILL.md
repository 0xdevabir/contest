# Restore drill log

Quarterly record of running `scripts/migrations/dr-restore-drill.ts` (restore
the nightly `pg_dump` — or a fresh dump of production — into a scratch
database, then run `npm run test` against it). Per `docs/DR.md` and the Phase
13 plan: "a backup that has never been restored is a hypothesis, not a
backup." The first drill is expected to find something broken — that's the
point of running it, not a sign something is wrong with the process.

Append one entry per drill, most recent first. Never fabricate an entry —
if a drill hasn't been run, say so.

## Log

### TODO — not yet run

No restore drill has been performed against real infrastructure yet. This
environment has no provisioned Neon project, no `NEON_API_KEY`/
`NEON_PROJECT_ID`, and no `TEST_DATABASE_URL` pointed at a durable Postgres
instance — `scripts/migrations/dr-restore-drill.ts` will detect this and exit
cleanly without attempting anything.

**Action item**: once the project has a Neon account with API access (or a
scratch Postgres instance reserved for this), run:

```bash
NEON_API_KEY=... NEON_PROJECT_ID=... npx tsx scripts/migrations/dr-restore-drill.ts
```

and record the outcome below using the template.

---

## Entry template

Copy this block for each new entry:

```
### YYYY-MM-DD

- **Operator**: <name>
- **Restore target**: <Neon branch | local Postgres>
- **Dump source**: <fresh pg_dump | scripts/backup-nightly.sh output from R2, dated ...>
- **Elapsed time**: dump <Xms>, restore <Yms>, test suite <Zms>, total <Wms>
- **Result**: <pass | fail>
- **What broke**: <specifics, or "nothing">
- **What was fixed**: <specifics, or "n/a">
- **Follow-ups filed**: <links/issue numbers, or "none">
```
