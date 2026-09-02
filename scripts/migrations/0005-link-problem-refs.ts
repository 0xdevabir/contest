/**
 * Backfills `problemRefId`/`problemVersionId` on `Submission`,
 * `SolvedProblem`, and `ContestProblem` rows that predate the Problem Domain
 * import — joining on the legacy `problemId` string against `Problem.slug`.
 * Batched at 1000 rows with a cursor so it is safe to re-run (idempotent:
 * only touches rows where the ref is still null) and safe to interrupt.
 *
 * Usage: npx tsx scripts/migrations/0005-link-problem-refs.ts
 */
import { prisma } from "../../src/lib/db";

const BATCH_SIZE = 1000;

async function linkSubmissions(): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await prisma.submission.findMany({
      where: { problemRefId: null },
      select: { id: true, problemId: true },
      take: BATCH_SIZE,
    });
    if (rows.length === 0) break;

    const slugs = [...new Set(rows.map((r) => r.problemId))];
    const problems = await prisma.problem.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true, currentVersionId: true },
    });
    const bySlug = new Map(problems.map((p) => [p.slug, p]));

    let batchUpdated = 0;
    for (const row of rows) {
      const problem = bySlug.get(row.problemId);
      if (!problem) continue;
      await prisma.submission.update({
        where: { id: row.id },
        data: { problemRefId: problem.id, problemVersionId: problem.currentVersionId },
      });
      batchUpdated++;
    }
    total += batchUpdated;
    // No match for any row in this batch means we've hit the tail of
    // legitimately-unmatched rows (a problem that was never imported) —
    // stop rather than looping forever re-fetching the same rows.
    if (batchUpdated === 0) break;
  }
  return total;
}

async function linkSolvedProblems(): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await prisma.solvedProblem.findMany({
      where: { problemRefId: null },
      select: { id: true, problemId: true },
      take: BATCH_SIZE,
    });
    if (rows.length === 0) break;

    const slugs = [...new Set(rows.map((r) => r.problemId))];
    const problems = await prisma.problem.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    const bySlug = new Map(problems.map((p) => [p.slug, p.id]));

    let batchUpdated = 0;
    for (const row of rows) {
      const problemId = bySlug.get(row.problemId);
      if (!problemId) continue;
      await prisma.solvedProblem.update({ where: { id: row.id }, data: { problemRefId: problemId } });
      batchUpdated++;
    }
    total += batchUpdated;
    if (batchUpdated === 0) break;
  }
  return total;
}

async function linkContestProblems(): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await prisma.contestProblem.findMany({
      where: { problemRefId: null },
      select: { id: true, problemId: true },
      take: BATCH_SIZE,
    });
    if (rows.length === 0) break;

    const slugs = [...new Set(rows.map((r) => r.problemId))];
    const problems = await prisma.problem.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true, currentVersionId: true },
    });
    const bySlug = new Map(problems.map((p) => [p.slug, p]));

    let batchUpdated = 0;
    for (const row of rows) {
      const problem = bySlug.get(row.problemId);
      if (!problem) continue;
      await prisma.contestProblem.update({
        where: { id: row.id },
        data: { problemRefId: problem.id, problemVersionId: problem.currentVersionId },
      });
      batchUpdated++;
    }
    total += batchUpdated;
    if (batchUpdated === 0) break;
  }
  return total;
}

async function reconcile(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) FROM "Submission" s
     WHERE s."problemRefId" IS NULL
       AND EXISTS (SELECT 1 FROM "Problem" p WHERE p.slug = s."problemId")`
  );
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const submissions = await linkSubmissions();
  const solves = await linkSolvedProblems();
  const contestProblems = await linkContestProblems();

  console.log(`Linked ${submissions} Submission rows.`);
  console.log(`Linked ${solves} SolvedProblem rows.`);
  console.log(`Linked ${contestProblems} ContestProblem rows.`);

  const remaining = await reconcile();
  console.log(`Reconciliation query (must be 0): ${remaining}`);
  if (remaining > 0) {
    console.error("Reconciliation failed — some Submission rows with a matching Problem.slug are still unlinked.");
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
