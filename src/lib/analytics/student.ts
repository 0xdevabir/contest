import { prisma } from "../db";

export type TagMasteryEntry = {
  tagId: string;
  slug: string;
  name: string;
  category: string;
  attempted: number;
  solved: number;
  mastery: number;
  avgAttemptsToAc: number | null;
};

export type TimelinePoint = { day: string; submitted: number; solved: number; minutesActive: number };

export type AssignmentHistoryEntry = {
  assignmentId: string;
  title: string;
  dueAt: Date | null;
  percent: number | null;
  status: string;
};

export type StudentDeepDive = {
  userId: string;
  name: string;
  email: string;
  tagMastery: TagMasteryEntry[];
  timeline: TimelinePoint[];
  assignmentHistory: AssignmentHistoryEntry[];
  attemptsDistribution: { userMedian: number | null; cohortMedian: number | null };
  recentSubmissions: {
    id: string;
    problemId: string;
    verdict: string;
    createdAt: Date;
    language: string;
  }[];
};

/** Tag mastery for a user, non-spoiler-gated (teacher/self view only — never public). */
export async function getTagMastery(userId: string): Promise<TagMasteryEntry[]> {
  const rows = await prisma.userTagStat.findMany({
    where: { userId, attempted: { gt: 0 } },
    include: { tag: true },
    orderBy: { mastery: "asc" },
  });
  return rows.map((r) => ({
    tagId: r.tagId,
    slug: r.tag.slug,
    name: r.tag.name,
    category: r.tag.category,
    attempted: r.attempted,
    solved: r.solved,
    mastery: r.mastery,
    avgAttemptsToAc: r.avgAttemptsToAc,
  }));
}

export async function getActivityTimeline(userId: string, days = 119): Promise<TimelinePoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await prisma.userDailyStat.findMany({
    where: { userId, day: { gte: since } },
    orderBy: { day: "asc" },
  });
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));

  const out: TimelinePoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    out.push({ day: key, submitted: row?.submitted ?? 0, solved: row?.solved ?? 0, minutesActive: row?.minutesActive ?? 0 });
  }
  return out;
}

/** D — the teacher-facing deep dive for one student in one section. */
export async function getStudentDeepDive(sectionId: string, userId: string): Promise<StudentDeepDive | null> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { sectionId, userId, status: "ACTIVE" },
    include: { user: true },
  });
  if (!enrollment || !enrollment.user) return null;

  const assignments = await prisma.assignment.findMany({
    where: { sectionId, published: true },
    orderBy: { dueAt: "asc" },
    include: { problems: true, column: true },
  });

  const problemIds = Array.from(new Set(assignments.flatMap((a) => a.problems.map((p) => p.problemId))));
  const bestRows =
    problemIds.length > 0
      ? await prisma.submission.groupBy({
          by: ["problemRefId"],
          where: { userId, problemRefId: { in: problemIds }, state: "DONE" },
          _max: { score: true, maxScore: true },
        })
      : [];
  const bestByProblem = new Map(bestRows.map((r) => [r.problemRefId!, r]));

  const assignmentHistory: AssignmentHistoryEntry[] = assignments.map((a) => {
    let raw = 0;
    let maxPoints = 0;
    let anySubmitted = false;
    for (const p of a.problems) {
      maxPoints += p.points;
      const best = bestByProblem.get(p.problemId);
      if (best?._max.score != null && best._max.maxScore) {
        anySubmitted = true;
        raw += (best._max.score / best._max.maxScore) * p.points;
      }
    }
    return {
      assignmentId: a.id,
      title: a.title,
      dueAt: a.dueAt,
      percent: anySubmitted && maxPoints > 0 ? (raw / maxPoints) * 100 : null,
      status: anySubmitted ? "submitted" : "not-started",
    };
  });

  const attemptsRows = await prisma.$queryRaw<Array<{ attempts: bigint }>>`
    SELECT COUNT(*) AS attempts
    FROM "Submission" s
    WHERE s."userId" = ${userId} AND s."problemRefId" IS NOT NULL AND s.state = 'DONE'
      AND s."createdAt" <= (
        SELECT MIN(s2."createdAt") FROM "Submission" s2
        WHERE s2."userId" = s."userId" AND s2."problemRefId" = s."problemRefId" AND s2.verdict = 'AC'
      )
    GROUP BY s."problemRefId"
  `;
  const attempts = attemptsRows.map((r) => Number(r.attempts)).sort((a, b) => a - b);
  const userMedian = attempts.length > 0 ? attempts[Math.floor(attempts.length / 2)] : null;

  const cohortEnrollments = await prisma.enrollment.findMany({
    where: { sectionId, status: "ACTIVE", role: "STUDENT" },
    select: { userId: true },
  });
  const cohortIds = cohortEnrollments.map((e) => e.userId).filter((id): id is string => !!id);
  const cohortAttemptsRows =
    cohortIds.length > 0
      ? await prisma.$queryRaw<Array<{ attempts: bigint }>>`
          SELECT COUNT(*) AS attempts
          FROM "Submission" s
          WHERE s."userId" = ANY(${cohortIds}) AND s."problemRefId" IS NOT NULL AND s.state = 'DONE'
            AND s."createdAt" <= (
              SELECT MIN(s2."createdAt") FROM "Submission" s2
              WHERE s2."userId" = s."userId" AND s2."problemRefId" = s."problemRefId" AND s2.verdict = 'AC'
            )
          GROUP BY s."userId", s."problemRefId"
        `
      : [];
  const cohortAttempts = cohortAttemptsRows.map((r) => Number(r.attempts)).sort((a, b) => a - b);
  const cohortMedian = cohortAttempts.length > 0 ? cohortAttempts[Math.floor(cohortAttempts.length / 2)] : null;

  const [tagMastery, timeline, recent] = await Promise.all([
    getTagMastery(userId),
    getActivityTimeline(userId),
    prisma.submission.findMany({
      where: { userId, state: "DONE" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, problemId: true, verdict: true, createdAt: true, language: true },
    }),
  ]);

  return {
    userId,
    name: enrollment.user.name,
    email: enrollment.user.email,
    tagMastery,
    timeline,
    assignmentHistory,
    attemptsDistribution: { userMedian, cohortMedian },
    recentSubmissions: recent,
  };
}
