import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { log } from "../log";
import { evaluateSignals, isAtRisk, type AssignmentScore } from "./signals";

/** (solved + 1) / (attempted + 2) — see PHASE-08 D1. */
export function laplaceMastery(solved: number, attempted: number): number {
  return (solved + 1) / (attempted + 2);
}

const BATCH_SIZE = 5000;

type Watermark = { cursorAt: Date | null; cursorId: string | null };

async function getWatermark(job: string): Promise<Watermark> {
  const row = await prisma.analyticsWatermark.findUnique({ where: { job } });
  return { cursorAt: row?.cursorAt ?? null, cursorId: row?.cursorId ?? null };
}

async function setWatermark(job: string, cursorAt: Date, cursorId: string): Promise<void> {
  await prisma.analyticsWatermark.upsert({
    where: { job },
    create: { job, cursorAt, cursorId, lastRunAt: new Date() },
    update: { cursorAt, cursorId, lastRunAt: new Date() },
  });
}

type TagAggRow = {
  tagId: string;
  attempted: bigint | number;
  solved: bigint | number;
  lastSolvedAt: Date | null;
  avgAttemptsToAc: number | null;
};

/** Recomputes every UserTagStat row touched by `userId`'s submission history. */
async function recomputeUserTagStats(userId: string): Promise<void> {
  const rows = await prisma.$queryRaw<TagAggRow[]>`
    WITH attempted AS (
      SELECT pt."tagId", COUNT(DISTINCT s."problemRefId") AS attempted
      FROM "Submission" s
      JOIN "ProblemTag" pt ON pt."problemId" = s."problemRefId"
      WHERE s."userId" = ${userId} AND s."problemRefId" IS NOT NULL AND s.state = 'DONE'
      GROUP BY pt."tagId"
    ),
    solved AS (
      SELECT pt."tagId", COUNT(DISTINCT sp."problemRefId") AS solved, MAX(sp."firstSolvedAt") AS "lastSolvedAt"
      FROM "SolvedProblem" sp
      JOIN "ProblemTag" pt ON pt."problemId" = sp."problemRefId"
      WHERE sp."userId" = ${userId} AND sp."problemRefId" IS NOT NULL
      GROUP BY pt."tagId"
    ),
    attempts_to_ac AS (
      SELECT pt."tagId", AVG(t.cnt)::float AS "avgAttemptsToAc"
      FROM (
        SELECT s."problemRefId", COUNT(*) AS cnt
        FROM "Submission" s
        WHERE s."userId" = ${userId} AND s."problemRefId" IS NOT NULL AND s.state = 'DONE'
          AND s."createdAt" <= (
            SELECT MIN(s2."createdAt") FROM "Submission" s2
            WHERE s2."userId" = s."userId" AND s2."problemRefId" = s."problemRefId" AND s2.verdict = 'AC'
          )
        GROUP BY s."problemRefId"
      ) t
      JOIN "ProblemTag" pt ON pt."problemId" = t."problemRefId"
      GROUP BY pt."tagId"
    )
    SELECT a."tagId", a.attempted, COALESCE(so.solved, 0) AS solved,
           so."lastSolvedAt", ata."avgAttemptsToAc"
    FROM attempted a
    LEFT JOIN solved so ON so."tagId" = a."tagId"
    LEFT JOIN attempts_to_ac ata ON ata."tagId" = a."tagId"
  `;

  for (const row of rows) {
    const attempted = Number(row.attempted);
    const solved = Number(row.solved);
    await prisma.userTagStat.upsert({
      where: { userId_tagId: { userId, tagId: row.tagId } },
      create: {
        userId,
        tagId: row.tagId,
        attempted,
        solved,
        mastery: laplaceMastery(solved, attempted),
        avgAttemptsToAc: row.avgAttemptsToAc,
        lastSolvedAt: row.lastSolvedAt,
      },
      update: {
        attempted,
        solved,
        mastery: laplaceMastery(solved, attempted),
        avgAttemptsToAc: row.avgAttemptsToAc,
        lastSolvedAt: row.lastSolvedAt,
      },
    });
  }
}

/**
 * D1 — incrementally rolls up UserTagStat for every user with a new judged
 * submission since the last run. Safe to call repeatedly (idempotent,
 * processes strictly-newer rows via a keyset watermark on createdAt/id).
 */
export async function rollupUserTagStats(): Promise<{ usersProcessed: number; submissionsScanned: number }> {
  const job = "userTagStat";
  let { cursorAt, cursorId } = await getWatermark(job);
  let usersProcessed = 0;
  let submissionsScanned = 0;
  const seenUsers = new Set<string>();

  for (;;) {
    const batch = await prisma.submission.findMany({
      where: {
        state: "DONE",
        userId: { not: null },
        ...(cursorAt
          ? {
              OR: [
                { createdAt: { gt: cursorAt } },
                { createdAt: cursorAt, id: { gt: cursorId ?? "" } },
              ],
            }
          : {}),
      },
      select: { id: true, userId: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;

    submissionsScanned += batch.length;
    for (const row of batch) {
      if (row.userId && !seenUsers.has(row.userId)) seenUsers.add(row.userId);
    }

    const last = batch[batch.length - 1];
    cursorAt = last.createdAt;
    cursorId = last.id;

    if (batch.length < BATCH_SIZE) break;
  }

  for (const userId of seenUsers) {
    await recomputeUserTagStats(userId);
    usersProcessed++;
  }

  if (cursorAt && cursorId) await setWatermark(job, cursorAt, cursorId);
  else await prisma.analyticsWatermark.upsert({ where: { job }, create: { job, lastRunAt: new Date() }, update: { lastRunAt: new Date() } });

  log.info("analytics rollup: userTagStat", { usersProcessed, submissionsScanned });
  return { usersProcessed, submissionsScanned };
}

/**
 * D1 — per-user daily activity counters, feeding both the analytics
 * timeline charts and ActivityHeatmap. `minutesActive` is an honest proxy
 * (no page-view telemetry exists): distinct 5-minute buckets touched by a
 * submission that day, times 5.
 */
export async function rollupUserDailyStats(): Promise<{ rowsUpserted: number }> {
  const job = "userDailyStat";
  let { cursorAt, cursorId } = await getWatermark(job);
  const touched = new Map<string, { userId: string; day: string }>();
  let rowsUpserted = 0;

  for (;;) {
    const batch = await prisma.submission.findMany({
      where: {
        state: "DONE",
        userId: { not: null },
        ...(cursorAt
          ? { OR: [{ createdAt: { gt: cursorAt } }, { createdAt: cursorAt, id: { gt: cursorId ?? "" } }] }
          : {}),
      },
      select: { id: true, userId: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      const day = row.createdAt.toISOString().slice(0, 10);
      touched.set(`${row.userId}:${day}`, { userId: row.userId!, day });
    }

    const last = batch[batch.length - 1];
    cursorAt = last.createdAt;
    cursorId = last.id;
    if (batch.length < BATCH_SIZE) break;
  }

  for (const { userId, day } of touched.values()) {
    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(`${day}T23:59:59.999Z`);

    const [submitted, solvedRows, times] = await Promise.all([
      prisma.submission.count({ where: { userId, state: "DONE", createdAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.solvedProblem.findMany({
        where: { userId, firstSolvedAt: { gte: dayStart, lte: dayEnd } },
        select: { id: true },
      }),
      prisma.submission.findMany({
        where: { userId, state: "DONE", createdAt: { gte: dayStart, lte: dayEnd } },
        select: { createdAt: true },
      }),
    ]);

    const buckets = new Set(times.map((t) => Math.floor(t.createdAt.getTime() / (5 * 60 * 1000))));

    await prisma.userDailyStat.upsert({
      where: { userId_day: { userId, day: dayStart } },
      create: { userId, day: dayStart, submitted, solved: solvedRows.length, minutesActive: buckets.size * 5 },
      update: { submitted, solved: solvedRows.length, minutesActive: buckets.size * 5 },
    });
    rowsUpserted++;
  }

  if (cursorAt && cursorId) await setWatermark(job, cursorAt, cursorId);
  else await prisma.analyticsWatermark.upsert({ where: { job }, create: { job, lastRunAt: new Date() }, update: { lastRunAt: new Date() } });

  log.info("analytics rollup: userDailyStat", { rowsUpserted });
  return { rowsUpserted };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * D1/D2 — full recompute of SectionStat for one section: weak tags, at-risk
 * roster with explainable signals, active-student count, median solved.
 * Deliberately a full (not incremental) recompute — cohort aggregates depend
 * on the whole roster, and D1 explicitly allows a full per-section recompute
 * as the backstop path.
 */
export async function rollupSectionStat(sectionId: string): Promise<void> {
  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId },
    include: {
      enrollments: { where: { status: "ACTIVE", role: "STUDENT" }, include: { user: true } },
      assignments: {
        include: { problems: true, column: true, extensions: true },
        orderBy: { dueAt: "asc" },
      },
    },
  });
  if (!section) return;

  const now = new Date();
  const students = section.enrollments.filter((e) => e.userId);
  const userIds = students.map((e) => e.userId!) as string[];

  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const recentSubs =
    userIds.length > 0
      ? await prisma.submission.findMany({
          where: { userId: { in: userIds }, state: "DONE", createdAt: { gte: fourteenDaysAgo } },
          select: { userId: true },
          distinct: ["userId"],
        })
      : [];
  const activeStudents = recentSubs.length;

  // Weak tags: average UserTagStat.mastery per tag across students who
  // attempted at least one problem with that tag.
  const tagStats =
    userIds.length > 0
      ? await prisma.userTagStat.findMany({
          where: { userId: { in: userIds }, attempted: { gt: 0 } },
          include: { tag: true },
        })
      : [];
  const byTag = new Map<string, { slug: string; name: string; sum: number; count: number }>();
  for (const s of tagStats) {
    const entry = byTag.get(s.tagId) ?? { slug: s.tag.slug, name: s.tag.name, sum: 0, count: 0 };
    entry.sum += s.mastery;
    entry.count += 1;
    byTag.set(s.tagId, entry);
  }
  const weakTags = Array.from(byTag.entries())
    .map(([tagId, v]) => ({ tagId, slug: v.slug, name: v.name, mastery: v.sum / v.count, sampleSize: v.count }))
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 10);

  // Assignment problem set, per assignment, for gradebook-style scoring.
  const allProblemIds = Array.from(new Set(section.assignments.flatMap((a) => a.problems.map((p) => p.problemId))));
  const bestRows =
    allProblemIds.length > 0 && userIds.length > 0
      ? await prisma.$queryRaw<Array<{ userId: string; problemId: string; score: number; maxScore: number; createdAt: Date; cnt: bigint }>>`
          SELECT DISTINCT ON ("userId", "problemRefId")
            "userId", "problemRefId" AS "problemId", score, "maxScore", "createdAt",
            COUNT(*) OVER (PARTITION BY "userId", "problemRefId") AS cnt
          FROM "Submission"
          WHERE "problemRefId" IN (${Prisma.join(allProblemIds)}) AND "userId" IN (${Prisma.join(userIds)}) AND state = 'DONE'
          ORDER BY "userId", "problemRefId", score DESC, "createdAt" ASC
        `
      : [];
  const bestByKey = new Map(bestRows.map((r) => [`${r.userId}:${r.problemId}`, r]));

  // Attempts-to-AC per user (for the struggle-pattern signal & cohort median).
  const attemptsToAcRows =
    userIds.length > 0
      ? await prisma.$queryRaw<Array<{ userId: string; attempts: bigint }>>`
          SELECT s."userId", COUNT(*) AS attempts
          FROM "Submission" s
          WHERE s."userId" = ANY(${userIds}) AND s.state = 'DONE' AND s."problemRefId" IS NOT NULL
            AND s."createdAt" <= (
              SELECT MIN(s2."createdAt") FROM "Submission" s2
              WHERE s2."userId" = s."userId" AND s2."problemRefId" = s."problemRefId" AND s2.verdict = 'AC'
            )
          GROUP BY s."userId", s."problemRefId"
        `
      : [];
  const attemptsByUser = new Map<string, number[]>();
  for (const r of attemptsToAcRows) {
    const arr = attemptsByUser.get(r.userId) ?? [];
    arr.push(Number(r.attempts));
    attemptsByUser.set(r.userId, arr);
  }
  const cohortMedianAttemptsToAc = median(attemptsToAcRows.map((r) => Number(r.attempts)));

  const solvedCountByUser = new Map<string, number>();
  if (userIds.length > 0) {
    const solved = await prisma.solvedProblem.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: { id: true },
    });
    for (const s of solved) solvedCountByUser.set(s.userId, s._count.id);
  }

  const solvedPerStudent: number[] = [];
  const atRiskEntries: { userId: string; name: string; signals: { key: string; sentence: string }[] }[] = [];

  const openAssignments = section.assignments.filter(
    (a) => a.published && (!a.closesAt || a.closesAt > now) && (!a.opensAt || a.opensAt <= now)
  );
  const upcomingAssignments = section.assignments.filter(
    (a) => a.published && a.dueAt && a.dueAt > now && a.dueAt.getTime() - now.getTime() < 48 * 60 * 60 * 1000
  );

  for (const enrollment of students) {
    const userId = enrollment.userId!;

    // Assignment-scoped solved count for medianSolved, and last submission.
    let solvedInSection = 0;
    let lastSubmissionAt: Date | null = null;
    const assignmentScores: AssignmentScore[] = [];

    for (const a of section.assignments) {
      if (!a.column?.published) continue;
      let raw = 0;
      let anySubmitted = false;
      for (const p of a.problems) {
        const row = bestByKey.get(`${userId}:${p.problemId}`);
        if (!row) continue;
        anySubmitted = true;
        if (row.score === row.maxScore && row.maxScore > 0) solvedInSection++;
        const contribution = row.maxScore > 0 ? (row.score / row.maxScore) * p.points : 0;
        raw += contribution;
        if (!lastSubmissionAt || row.createdAt > lastSubmissionAt) lastSubmissionAt = row.createdAt;
      }
      const maxPoints = a.problems.reduce((s, p) => s + p.points, 0) || 1;
      if (anySubmitted) {
        assignmentScores.push({
          assignmentId: a.id,
          title: a.title,
          percent: (raw / maxPoints) * 100,
          dueAt: a.dueAt,
          submissionCount: 1,
        });
      }
    }
    solvedPerStudent.push(solvedInSection);

    const upcomingUnstarted = upcomingAssignments
      .filter((a) => !a.problems.some((p) => bestByKey.has(`${userId}:${p.problemId}`)))
      .map((a) => ({ title: a.title, dueAt: a.dueAt! }));

    const attempts = attemptsByUser.get(userId) ?? [];
    const studentMedianAttemptsToAc = attempts.length > 0 ? median(attempts) : null;

    const signals = evaluateSignals({
      now,
      lastSubmissionAt,
      hasOpenAssignment: openAssignments.length > 0,
      assignmentScores,
      upcomingUnstarted,
      studentMedianAttemptsToAc,
      cohortMedianAttemptsToAc: cohortMedianAttemptsToAc || null,
      enrolledAt: enrollment.joinedAt ?? enrollment.createdAt,
      everSolvedCount: solvedCountByUser.get(userId) ?? 0,
    });

    if (isAtRisk(signals)) {
      atRiskEntries.push({ userId, name: enrollment.user?.name ?? enrollment.name ?? "Unknown", signals });
    }
  }

  atRiskEntries.sort((a, b) => b.signals.length - a.signals.length);

  await prisma.sectionStat.upsert({
    where: { sectionId },
    create: {
      sectionId,
      activeStudents,
      medianSolved: median(solvedPerStudent),
      weakTags,
      atRisk: atRiskEntries,
      atRiskUserIds: atRiskEntries.map((e) => e.userId),
    },
    update: {
      activeStudents,
      medianSolved: median(solvedPerStudent),
      weakTags,
      atRisk: atRiskEntries,
      atRiskUserIds: atRiskEntries.map((e) => e.userId),
    },
  });
}

/** All sections with any submission activity since the userTagStat watermark — the sections worth re-rolling up. */
export async function rollupActiveSections(): Promise<{ sectionsProcessed: number }> {
  const sections = await prisma.courseSection.findMany({ where: { archived: false }, select: { id: true } });
  for (const s of sections) {
    await rollupSectionStat(s.id);
  }
  log.info("analytics rollup: sectionStat", { sectionsProcessed: sections.length });
  return { sectionsProcessed: sections.length };
}

/** Entry point for the nightly job / admin-triggered force rollup. */
export async function runAnalyticsRollup(opts?: { sectionId?: string }): Promise<{
  userTagStats: { usersProcessed: number; submissionsScanned: number };
  userDailyStats: { rowsUpserted: number };
  sections: { sectionsProcessed: number };
}> {
  const userTagStats = await rollupUserTagStats();
  const userDailyStats = await rollupUserDailyStats();
  const sections = opts?.sectionId
    ? (await rollupSectionStat(opts.sectionId), { sectionsProcessed: 1 })
    : await rollupActiveSections();
  return { userTagStats, userDailyStats, sections };
}
