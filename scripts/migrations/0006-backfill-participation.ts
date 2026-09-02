/**
 * Phase 5 backfill (docs/phases/PHASE-05-contest-engine.md — migration plan):
 *   - Each `ContestRegistration` -> `ContestParticipation{mode: LIVE, official: true}`
 *   - Each contest's creator -> `ContestStaff{role: OWNER}`
 *   - `Submission.participationId` linked by `(contestId, userId)`
 *
 * `visibility`/`joinPolicy` are NOT backfilled here — the `0006_contest_engine`
 * migration added those columns with `DEFAULT 'PUBLIC'`/`DEFAULT 'OPEN'`,
 * which Postgres already applied to every existing row.
 *
 * Idempotent: participation/staff writes are upserts on their unique keys, and
 * submission linking only touches rows where `participationId` is still null,
 * so this is safe to re-run (e.g. after new registrations land) without
 * duplicating anything.
 *
 * Usage: npx tsx scripts/migrations/0006-backfill-participation.ts
 */
import { prisma } from "../../src/lib/db";

const BATCH_SIZE = 1000;

async function backfillParticipations(): Promise<number> {
  let total = 0;
  let skip = 0;
  for (;;) {
    const rows = await prisma.contestRegistration.findMany({
      skip,
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
      select: { contestId: true, userId: true, createdAt: true },
    });
    if (rows.length === 0) break;

    for (const r of rows) {
      await prisma.contestParticipation.upsert({
        where: { contestId_userId_mode: { contestId: r.contestId, userId: r.userId, mode: "LIVE" } },
        update: {},
        create: {
          contestId: r.contestId,
          userId: r.userId,
          mode: "LIVE",
          official: true,
          registeredAt: r.createdAt,
        },
      });
      total++;
    }
    skip += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }
  return total;
}

async function backfillOwnerStaff(): Promise<number> {
  let total = 0;
  let skip = 0;
  for (;;) {
    const rows = await prisma.contest.findMany({
      skip,
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
      select: { id: true, createdById: true },
    });
    if (rows.length === 0) break;

    for (const c of rows) {
      await prisma.contestStaff.upsert({
        where: { contestId_userId: { contestId: c.id, userId: c.createdById } },
        update: {},
        create: { contestId: c.id, userId: c.createdById, role: "OWNER", addedById: c.createdById },
      });
      total++;
    }
    skip += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }
  return total;
}

async function linkSubmissions(): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await prisma.submission.findMany({
      where: { participationId: null, contestId: { not: null }, userId: { not: null } },
      select: { id: true, contestId: true, userId: true },
      take: BATCH_SIZE,
    });
    if (rows.length === 0) break;

    let batchUpdated = 0;
    for (const row of rows) {
      const participation = await prisma.contestParticipation.findUnique({
        where: { contestId_userId_mode: { contestId: row.contestId!, userId: row.userId!, mode: "LIVE" } },
        select: { id: true },
      });
      if (!participation) continue;
      await prisma.submission.update({ where: { id: row.id }, data: { participationId: participation.id } });
      batchUpdated++;
    }
    total += batchUpdated;
    // No match in this batch means the remaining unlinked rows genuinely have
    // no corresponding registration (e.g. practice submissions with a stale
    // contestId) — stop rather than re-scanning them forever.
    if (batchUpdated === 0) break;
  }
  return total;
}

async function reconcile(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) FROM "ContestRegistration" r
     WHERE NOT EXISTS (
       SELECT 1 FROM "ContestParticipation" p
       WHERE p."contestId" = r."contestId" AND p."userId" = r."userId" AND p.mode = 'LIVE'
     )`
  );
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const participations = await backfillParticipations();
  const staff = await backfillOwnerStaff();
  const submissions = await linkSubmissions();

  console.log(`Upserted ${participations} ContestParticipation rows (from ContestRegistration).`);
  console.log(`Upserted ${staff} ContestStaff OWNER rows (from Contest.createdById).`);
  console.log(`Linked ${submissions} Submission rows to a participation.`);

  const remaining = await reconcile();
  console.log(`Reconciliation query (must be 0): ${remaining}`);
  if (remaining > 0) {
    console.error("Reconciliation failed — some ContestRegistration rows have no matching LIVE participation.");
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
