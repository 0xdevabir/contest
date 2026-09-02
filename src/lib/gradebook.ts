import { Prisma, type LatePolicy } from "@prisma/client";
import { prisma } from "./db";
import { getContestDashboard } from "./contest-dashboard";

export type GradeCellStatus =
  | "not-started"
  | "in-progress"
  | "submitted"
  | "late"
  | "graded"
  | "excused";

export type GradeCell = {
  columnId: string;
  raw: number | null; // engine output before adjustments
  lateMultiplier: number; // 1 when on time
  computed: number | null; // raw × lateMultiplier
  override: number | null;
  final: number | null; // override ?? computed
  status: GradeCellStatus;
  submissionCount: number;
  bestSubmissionId: string | null;
};

export type ColumnMeta = {
  id: string;
  source: "ASSIGNMENT" | "CONTEST" | "MANUAL";
  title: string;
  maxPoints: number;
  weight: number;
  order: number;
  published: boolean;
};

export type StudentRow = {
  userId: string;
  name: string;
  email: string;
  studentId: string | null;
  cells: Record<string, GradeCell>; // columnId -> cell
  total: number; // weighted sum across published columns
  maxTotal: number;
};

export type Totals = {
  studentCount: number;
  columnCount: number;
  classAverage: number; // average of student totals (0-100 normalized), 0 when no published columns
};

/**
 * Gradebook-specific late multiplier — Phase 6's four-value LatePolicy
 * (NONE/LINEAR/GRACE_THEN_LINEAR/REJECT) with a per-policy `lateParam`,
 * distinct from src/lib/scoring/assignment.ts's contest-oriented
 * `lateMultiplier` (hardcoded 10%/day, no REJECT, no lateParam).
 */
export function lateMultiplier(
  dueAt: Date | null,
  submittedAt: Date,
  policy: LatePolicy,
  lateParam: number
): number {
  if (!dueAt) return 1;
  const lateMs = submittedAt.getTime() - dueAt.getTime();
  if (lateMs <= 0) return 1;
  const dayMs = 24 * 60 * 60 * 1000;

  switch (policy) {
    case "NONE":
      return 0;
    case "REJECT":
      // Submissions after dueAt should have been rejected at the API layer;
      // if one exists anyway (grandfathered data), it earns nothing.
      return 0;
    case "LINEAR": {
      const daysLate = lateMs / dayMs;
      return Math.max(0, 1 - (lateParam / 100) * daysLate);
    }
    case "GRACE_THEN_LINEAR": {
      const graceMs = lateParam * 60 * 60 * 1000;
      if (lateMs <= graceMs) return 1;
      const daysLateAfterGrace = (lateMs - graceMs) / dayMs;
      return Math.max(0, 1 - 0.1 * daysLateAfterGrace);
    }
    default:
      return 1;
  }
}

type BestSubmissionRow = {
  id: string;
  userId: string;
  problemId: string; // Problem.id (via Submission.problemRefId)
  score: number;
  maxScore: number;
  createdAt: Date;
  cnt: bigint;
};

export async function computeGradebook(
  sectionId: string,
  opts?: { columnIds?: string[]; userIds?: string[] }
): Promise<{ students: StudentRow[]; columns: ColumnMeta[]; totals: Totals }> {
  // Query 1: enrolled students.
  const enrollments = await prisma.enrollment.findMany({
    where: {
      sectionId,
      status: "ACTIVE",
      role: "STUDENT",
      ...(opts?.userIds ? { userId: { in: opts.userIds } } : {}),
    },
    select: { userId: true, email: true, name: true, studentId: true, user: { select: { id: true, name: true, email: true, studentId: true } } },
  });
  const students = enrollments.filter((e) => e.userId);
  const userIds = students.map((e) => e.userId!) as string[];

  // Query 2: gradebook columns with their assignment problems.
  const columns = await prisma.gradebookColumn.findMany({
    where: { sectionId, ...(opts?.columnIds ? { id: { in: opts.columnIds } } : {}) },
    orderBy: { order: "asc" },
    include: {
      assignment: {
        include: { problems: { orderBy: { order: "asc" } }, extensions: true },
      },
    },
  });

  const assignmentColumns = columns.filter((c) => c.source === "ASSIGNMENT" && c.assignment);
  const contestColumns = columns.filter((c) => c.source === "CONTEST" && c.contestId);
  const columnIds = columns.map((c) => c.id);

  const problemIds = Array.from(
    new Set(assignmentColumns.flatMap((c) => c.assignment!.problems.map((p) => p.problemId)))
  );

  // Query 3: best submission per (userId, problemId), with attempt count via
  // a window function so it stays a single query.
  let bestRows: BestSubmissionRow[] = [];
  if (problemIds.length > 0 && userIds.length > 0) {
    bestRows = await prisma.$queryRaw<BestSubmissionRow[]>`
      SELECT DISTINCT ON ("userId", "problemRefId")
        id, "userId", "problemRefId" AS "problemId", score, "maxScore", "createdAt",
        COUNT(*) OVER (PARTITION BY "userId", "problemRefId") AS cnt
      FROM "Submission"
      WHERE "problemRefId" IN (${Prisma.join(problemIds)})
        AND "userId" IN (${Prisma.join(userIds)})
      ORDER BY "userId", "problemRefId", score DESC, "createdAt" ASC
    `;
  }
  const bestByKey = new Map<string, BestSubmissionRow>();
  for (const row of bestRows) bestByKey.set(`${row.userId}:${row.problemId}`, row);

  // Query 4: overrides for the visible columns/students (batched, small).
  const overrides =
    columnIds.length > 0 && userIds.length > 0
      ? await prisma.gradeOverride.findMany({
          where: { columnId: { in: columnIds }, userId: { in: userIds } },
        })
      : [];
  const overrideByKey = new Map(overrides.map((o) => [`${o.columnId}:${o.userId}`, o]));

  // Contest-sourced columns: one dashboard lookup per distinct contest.
  const contestIds = Array.from(new Set(contestColumns.map((c) => c.contestId!)));
  const contestPointsByContest = new Map<string, Map<string, number>>();
  for (const contestId of contestIds) {
    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) continue;
    const dashboard = await getContestDashboard(contestId, {
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      rules: contest.rules,
      createdAt: contest.createdAt,
    });
    const pointsByUser = new Map<string, number>();
    for (const row of dashboard.rows) pointsByUser.set(row.userId, row.points);
    contestPointsByContest.set(contestId, pointsByUser);
  }

  const columnMeta: ColumnMeta[] = columns.map((c) => ({
    id: c.id,
    source: c.source,
    title: c.title,
    maxPoints: c.maxPoints,
    weight: c.weight,
    order: c.order,
    published: c.published,
  }));

  const studentRows: StudentRow[] = students.map((e) => {
    const userId = e.userId!;
    const cells: Record<string, GradeCell> = {};

    for (const col of columns) {
      let cell: GradeCell;

      if (col.source === "ASSIGNMENT" && col.assignment) {
        const assignment = col.assignment;
        const extension = assignment.extensions.find((ext) => ext.userId === userId);
        const effectiveDue = extension?.newDueAt ?? assignment.dueAt;

        let rawTotal = 0;
        let submissionCount = 0;
        let bestSubmissionId: string | null = null;
        let bestSubmissionScore = -1;
        let latestSubmittedAt: Date | null = null;
        let anySubmitted = false;
        let allSubmitted = assignment.problems.length > 0;

        for (const problem of assignment.problems) {
          const row = bestByKey.get(`${userId}:${problem.problemId}`);
          if (!row) {
            allSubmitted = false;
            continue;
          }
          anySubmitted = true;
          submissionCount += Number(row.cnt);
          // Submission.score is 0..maxScore for the judged problem; scale it
          // against this AssignmentProblem's point weight.
          const contribution = row.maxScore > 0 ? (row.score / row.maxScore) * problem.points : 0;
          rawTotal += contribution;
          if (row.score > bestSubmissionScore) {
            bestSubmissionScore = row.score;
            bestSubmissionId = row.id;
          }
          if (!latestSubmittedAt || row.createdAt > latestSubmittedAt) latestSubmittedAt = row.createdAt;
        }

        const mult = latestSubmittedAt
          ? lateMultiplier(effectiveDue, latestSubmittedAt, assignment.latePolicy, assignment.lateParam)
          : 1;
        const computed = anySubmitted ? rawTotal * mult : null;
        const override = overrideByKey.get(`${col.id}:${userId}`);
        const final = override ? override.points : computed;

        let status: GradeCellStatus = "not-started";
        if (override) status = "graded";
        else if (anySubmitted && latestSubmittedAt && effectiveDue && latestSubmittedAt > effectiveDue) status = "late";
        else if (allSubmitted) status = "submitted";
        else if (anySubmitted) status = "in-progress";

        cell = {
          columnId: col.id,
          raw: anySubmitted ? rawTotal : null,
          lateMultiplier: mult,
          computed,
          override: override ? override.points : null,
          final,
          status,
          submissionCount,
          bestSubmissionId,
        };
      } else if (col.source === "CONTEST" && col.contestId) {
        const points = contestPointsByContest.get(col.contestId)?.get(userId) ?? null;
        const override = overrideByKey.get(`${col.id}:${userId}`);
        const final = override ? override.points : points;
        cell = {
          columnId: col.id,
          raw: points,
          lateMultiplier: 1,
          computed: points,
          override: override ? override.points : null,
          final,
          status: override ? "graded" : points != null ? "submitted" : "not-started",
          submissionCount: 0,
          bestSubmissionId: null,
        };
      } else {
        // MANUAL column: entirely override-driven.
        const override = overrideByKey.get(`${col.id}:${userId}`);
        cell = {
          columnId: col.id,
          raw: null,
          lateMultiplier: 1,
          computed: null,
          override: override ? override.points : null,
          final: override ? override.points : null,
          status: override ? "graded" : "not-started",
          submissionCount: 0,
          bestSubmissionId: null,
        };
      }

      cells[col.id] = cell;
    }

    let weightedSum = 0;
    let weightSum = 0;
    for (const col of columns) {
      if (!col.published) continue;
      const cell = cells[col.id];
      if (cell.final == null || col.maxPoints <= 0) continue;
      weightedSum += (cell.final / col.maxPoints) * col.weight;
      weightSum += col.weight;
    }
    const total = weightSum > 0 ? (weightedSum / weightSum) * 100 : 0;

    return {
      userId,
      name: e.user?.name ?? e.name ?? "",
      email: e.user?.email ?? e.email ?? "",
      studentId: e.user?.studentId ?? e.studentId ?? null,
      cells,
      total,
      maxTotal: 100,
    };
  });

  const publishedCount = columns.filter((c) => c.published).length;
  const classAverage =
    studentRows.length > 0 && publishedCount > 0
      ? studentRows.reduce((sum, s) => sum + s.total, 0) / studentRows.length
      : 0;

  return {
    students: studentRows,
    columns: columnMeta,
    totals: {
      studentCount: studentRows.length,
      columnCount: columns.length,
      classAverage,
    },
  };
}

// --- tiny per-section TTL cache, enough to hit the 400ms p95 budget -------
type CacheEntry = { value: Awaited<ReturnType<typeof computeGradebook>>; expiresAt: number };
const CACHE_TTL_MS = 5_000;
const cache = new Map<string, CacheEntry>();

export async function computeGradebookCached(sectionId: string): Promise<Awaited<ReturnType<typeof computeGradebook>>> {
  const cached = cache.get(sectionId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await computeGradebook(sectionId);
  cache.set(sectionId, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

export function invalidateGradebookCache(sectionId: string): void {
  cache.delete(sectionId);
}
