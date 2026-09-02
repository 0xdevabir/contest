import { prisma } from "../db";

export type VerdictBucket = { verdict: string; count: number };

export type ProblemAnalytics = {
  problemId: string;
  slug: string;
  title: string;
  attempts: number;
  distinctUsers: number;
  acRate: number; // 0-1, over distinct users who attempted
  medianAttemptsToAc: number | null;
  verdictDistribution: VerdictBucket[];
  firstAcLanguageDistribution: { language: string; count: number }[];
  /** Point-biserial-ish correlation between "solved this problem" and overall AC rate. */
  discrimination: number | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * D4 — discrimination: correlate "did this user solve problem P" (0/1) with
 * their overall AC rate across every other problem they attempted. A
 * problem strong students fail and weak students pass gets a negative
 * value — usually an ambiguous statement or a bad test.
 */
async function computeDiscrimination(problemId: string): Promise<number | null> {
  const attemptRows = await prisma.submission.findMany({
    where: { problemRefId: problemId, state: "DONE", userId: { not: null } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const userIds = attemptRows.map((r) => r.userId!) as string[];
  if (userIds.length < 8) return null; // too small a sample to mean anything

  const solvedSet = new Set(
    (
      await prisma.solvedProblem.findMany({
        where: { userId: { in: userIds }, problemRefId: problemId },
        select: { userId: true },
      })
    ).map((r) => r.userId)
  );

  const overallRows = await prisma.$queryRaw<Array<{ userId: string; attempted: bigint; solved: bigint }>>`
    SELECT s."userId",
           COUNT(DISTINCT s."problemRefId") AS attempted,
           COUNT(DISTINCT CASE WHEN s.verdict = 'AC' THEN s."problemRefId" END) AS solved
    FROM "Submission" s
    WHERE s."userId" = ANY(${userIds}) AND s."problemRefId" IS NOT NULL AND s.state = 'DONE'
      AND s."problemRefId" != ${problemId}
    GROUP BY s."userId"
  `;
  const overallByUser = new Map(
    overallRows.map((r) => [r.userId, Number(r.attempted) > 0 ? Number(r.solved) / Number(r.attempted) : 0])
  );

  const xs: number[] = []; // solved this problem: 0/1
  const ys: number[] = []; // overall AC rate elsewhere
  for (const userId of userIds) {
    xs.push(solvedSet.has(userId) ? 1 : 0);
    ys.push(overallByUser.get(userId) ?? 0);
  }

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

export async function getProblemAnalytics(problemId: string): Promise<ProblemAnalytics | null> {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, slug: true, title: true },
  });
  if (!problem) return null;

  const [attempts, distinctUsersRows, verdictRows, firstAcRows, attemptsToAcRows, discrimination] = await Promise.all([
    prisma.submission.count({ where: { problemRefId: problemId, state: "DONE" } }),
    prisma.submission.findMany({
      where: { problemRefId: problemId, state: "DONE", userId: { not: null } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.submission.groupBy({
      by: ["verdict"],
      where: { problemRefId: problemId, state: "DONE" },
      _count: { id: true },
    }),
    prisma.$queryRaw<Array<{ language: string }>>`
      SELECT DISTINCT ON (s."userId") s.language
      FROM "Submission" s
      WHERE s."problemRefId" = ${problemId} AND s.verdict = 'AC' AND s.state = 'DONE'
      ORDER BY s."userId", s."createdAt" ASC
    `.then((rows) => {
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
      return Array.from(counts.entries()).map(([language, cnt]) => ({ language, cnt }));
    }),
    prisma.$queryRaw<Array<{ attempts: bigint }>>`
      SELECT COUNT(*) AS attempts
      FROM "Submission" s
      WHERE s."problemRefId" = ${problemId} AND s.state = 'DONE'
        AND s."createdAt" <= (
          SELECT MIN(s2."createdAt") FROM "Submission" s2
          WHERE s2."userId" = s."userId" AND s2."problemRefId" = s."problemRefId" AND s2.verdict = 'AC'
        )
      GROUP BY s."userId"
    `,
    computeDiscrimination(problemId),
  ]);

  const distinctUsers = distinctUsersRows.length;
  const solvedUsers = await prisma.solvedProblem.count({ where: { problemRefId: problemId } });
  const acRate = distinctUsers > 0 ? solvedUsers / distinctUsers : 0;

  return {
    problemId: problem.id,
    slug: problem.slug,
    title: problem.title,
    attempts,
    distinctUsers,
    acRate,
    medianAttemptsToAc: median(attemptsToAcRows.map((r) => Number(r.attempts))),
    verdictDistribution: verdictRows.map((v) => ({ verdict: v.verdict, count: v._count.id })),
    firstAcLanguageDistribution: firstAcRows.map((r) => ({ language: r.language, count: Number(r.cnt) })),
    discrimination,
  };
}
