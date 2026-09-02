import { Prisma, type Verdict } from "@prisma/client";
import { prisma } from "../db";

export type WeakTag = { tagId: string; slug: string; name: string; mastery: number; sampleSize: number };
export type AtRiskEntry = { userId: string; name: string; signals: { key: string; sentence: string }[] };

export type SectionSummary = {
  sectionId: string;
  activeStudents: number;
  totalStudents: number;
  medianSolved: number;
  weakTags: WeakTag[];
  atRisk: AtRiskEntry[];
  submissionsThisWeek: number;
  updatedAt: Date | null;
};

/** D3/acceptance-criteria — the header stats + at-risk list + weak-topic chart. */
export async function getSectionSummary(sectionId: string): Promise<SectionSummary> {
  const [stat, totalStudents, weekAgo] = await Promise.all([
    prisma.sectionStat.findUnique({ where: { sectionId } }),
    prisma.enrollment.count({ where: { sectionId, status: "ACTIVE", role: "STUDENT" } }),
    Promise.resolve(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
  ]);

  const enrolledIds = (
    await prisma.enrollment.findMany({
      where: { sectionId, status: "ACTIVE", role: "STUDENT" },
      select: { userId: true },
    })
  )
    .map((e) => e.userId)
    .filter((id): id is string => !!id);

  const submissionsThisWeek =
    enrolledIds.length > 0
      ? await prisma.submission.count({
          where: { userId: { in: enrolledIds }, createdAt: { gte: weekAgo }, state: "DONE" },
        })
      : 0;

  return {
    sectionId,
    activeStudents: stat?.activeStudents ?? 0,
    totalStudents,
    medianSolved: stat?.medianSolved ?? 0,
    weakTags: (stat?.weakTags as unknown as WeakTag[]) ?? [],
    atRisk: (stat?.atRisk as unknown as AtRiskEntry[]) ?? [],
    submissionsThisWeek,
    updatedAt: stat?.updatedAt ?? null,
  };
}

export type HeatmapCell = {
  userId: string;
  problemId: string;
  bestVerdict: Verdict | null;
  attempts: number;
};

export type HeatmapPayload = {
  students: { userId: string; name: string }[];
  problems: { problemId: string; title: string; assignmentId: string; assignmentTitle: string; label: string }[];
  cells: HeatmapCell[];
};

/**
 * D3 — student x problem grid, grouped by assignment column order. `?assignmentId=`
 * scopes to one assignment; otherwise every problem across the section's
 * assignments (bounded to keep the grid reasonable at 60x40-ish scale).
 */
export async function getHeatmap(sectionId: string, opts?: { assignmentId?: string }): Promise<HeatmapPayload> {
  const enrollments = await prisma.enrollment.findMany({
    where: { sectionId, status: "ACTIVE", role: "STUDENT" },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ user: { name: "asc" } }],
  });
  const students = enrollments
    .filter((e) => e.userId)
    .map((e) => ({ userId: e.userId!, name: e.user?.name ?? e.name ?? "Unknown" }));

  const assignments = await prisma.assignment.findMany({
    where: { sectionId, published: true, ...(opts?.assignmentId ? { id: opts.assignmentId } : {}) },
    orderBy: { dueAt: "asc" },
    include: { problems: { orderBy: { order: "asc" }, include: { problem: { select: { id: true, slug: true, title: true } } } } },
  });

  const problems = assignments.flatMap((a) =>
    a.problems.map((p) => ({
      problemId: p.problemId,
      title: p.problem.title,
      assignmentId: a.id,
      assignmentTitle: a.title,
      label: p.problem.slug,
    }))
  );

  const userIds = students.map((s) => s.userId);
  const problemIds = problems.map((p) => p.problemId);

  if (userIds.length === 0 || problemIds.length === 0) {
    return { students, problems, cells: [] };
  }

  // Best verdict per (user, problem), rank AC first, else the most recent.
  const rows = await prisma.$queryRaw<Array<{ userId: string; problemId: string; verdict: Verdict; cnt: bigint }>>`
    SELECT DISTINCT ON ("userId", "problemRefId")
      "userId", "problemRefId" AS "problemId", verdict,
      COUNT(*) OVER (PARTITION BY "userId", "problemRefId") AS cnt
    FROM "Submission"
    WHERE "userId" IN (${Prisma.join(userIds)}) AND "problemRefId" IN (${Prisma.join(problemIds)}) AND state = 'DONE'
    ORDER BY "userId", "problemRefId",
      CASE WHEN verdict = 'AC' THEN 0 ELSE 1 END, "createdAt" DESC
  `;

  const cells: HeatmapCell[] = rows.map((r) => ({
    userId: r.userId,
    problemId: r.problemId,
    bestVerdict: r.verdict,
    attempts: Number(r.cnt),
  }));

  return { students, problems, cells };
}

/** Submissions for one (student, problem) pair — the D3 cell-click side panel. */
export async function getCellSubmissions(sectionId: string, userId: string, problemId: string) {
  const enrolled = await prisma.enrollment.findFirst({
    where: { sectionId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!enrolled) return [];

  return prisma.submission.findMany({
    where: { userId, problemRefId: problemId, state: "DONE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      verdict: true,
      score: true,
      maxScore: true,
      language: true,
      createdAt: true,
      maxCpuMs: true,
      maxMemoryKb: true,
    },
    take: 50,
  });
}
