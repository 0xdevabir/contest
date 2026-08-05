import type { University, Verdict } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeThemeMode, type ThemeMode } from "@/lib/theme";
import { getCategories, getMeta, getProblem } from "@/lib/problems";
import type { Difficulty } from "@/lib/types";

export type ProfileStats = {
  solved: number;
  totalProblems: number;
  submissions: number;
  acceptedSubs: number;
  acceptanceRate: number;
  contestsJoined: number;
  globalRank: number | null;
  uniRank: number | null;
  byDifficulty: { tier: Difficulty; solved: number; total: number }[];
  recentSolves: {
    problemId: string;
    title: string;
    difficulty: Difficulty;
    solvedAt: Date;
  }[];
  activity: { date: string; count: number }[];
  verdictBreakdown: { verdict: Verdict; count: number }[];
};

export type PublicProfile = {
  id: string;
  name: string;
  university: University;
  department: string | null;
  studentId: string | null;
  bio: string;
  email: string | null;
  emailVerified: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  theme: ThemeMode;
  editorFontSize: number;
  profilePublic: boolean;
  showEmail: boolean;
  stats: ProfileStats;
};

async function rankAmong(
  userId: string,
  university?: University
): Promise<number | null> {
  const grouped = await prisma.solvedProblem.groupBy({
    by: ["userId"],
    _count: { problemId: true },
    _max: { firstSolvedAt: true },
    orderBy: [{ _count: { problemId: "desc" } }, { _max: { firstSolvedAt: "asc" } }],
  });
  if (!grouped.length) return null;

  const users = await prisma.user.findMany({
    where: {
      id: { in: grouped.map((g) => g.userId) },
      status: "ACTIVE",
      ...(university ? { university } : {}),
    },
    select: { id: true },
  });
  const allowed = new Set(users.map((u) => u.id));
  const ranked = grouped.filter((g) => allowed.has(g.userId));
  const idx = ranked.findIndex((g) => g.userId === userId);
  return idx >= 0 ? idx + 1 : null;
}

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const meta = getMeta();
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 119);

  const [solvedRows, submissionCount, acceptedSubs, contestsJoined, recentSolves, activitySubs, verdicts, user] =
    await Promise.all([
      prisma.solvedProblem.findMany({
        where: { userId },
        select: { problemId: true, firstSolvedAt: true },
        orderBy: { firstSolvedAt: "desc" },
      }),
      prisma.submission.count({ where: { userId } }),
      prisma.submission.count({ where: { userId, verdict: "AC" } }),
      prisma.contestRegistration.count({ where: { userId } }),
      prisma.solvedProblem.findMany({
        where: { userId },
        orderBy: { firstSolvedAt: "desc" },
        take: 8,
        select: { problemId: true, firstSolvedAt: true },
      }),
      prisma.submission.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.submission.groupBy({
        by: ["verdict"],
        where: { userId },
        _count: { _all: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { university: true },
      }),
    ]);

  const dayMap = new Map<string, number>();
  for (const s of activitySubs) {
    const key = s.createdAt.toISOString().slice(0, 10);
    dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
  }
  const activity: { date: string; count: number }[] = [];
  for (let i = 119; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    activity.push({ date: key, count: dayMap.get(key) ?? 0 });
  }

  const solvedSet = new Set(solvedRows.map((r) => r.problemId));
  const byDifficulty = getCategories().map((c) => ({
    tier: c.tier,
    total: c.count,
    solved: c.problems.filter((p) => solvedSet.has(p.id)).length,
  }));

  const [globalRank, uniRank] = await Promise.all([
    rankAmong(userId),
    user ? rankAmong(userId, user.university) : null,
  ]);

  return {
    solved: solvedRows.length,
    totalProblems: meta.total,
    submissions: submissionCount,
    acceptedSubs,
    acceptanceRate: submissionCount
      ? Math.round((acceptedSubs / submissionCount) * 1000) / 10
      : 0,
    contestsJoined,
    globalRank,
    uniRank,
    byDifficulty,
    recentSolves: recentSolves.map((r) => {
      const p = getProblem(r.problemId);
      return {
        problemId: r.problemId,
        title: p?.title ?? r.problemId,
        difficulty: (p?.difficulty ?? "EASY") as Difficulty,
        solvedAt: r.firstSolvedAt,
      };
    }),
    activity,
    verdictBreakdown: verdicts.map((v) => ({
      verdict: v.verdict,
      count: v._count._all,
    })),
  };
}

export async function getPublicProfile(
  userId: string,
  viewerId?: string | null
): Promise<PublicProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      university: true,
      department: true,
      studentId: true,
      bio: true,
      emailVerified: true,
      createdAt: true,
      lastLoginAt: true,
      theme: true,
      editorFontSize: true,
      profilePublic: true,
      showEmail: true,
      status: true,
    },
  });
  if (!user || user.status !== "ACTIVE") return null;
  const isOwner = viewerId === userId;
  if (!user.profilePublic && !isOwner) return null;

  const stats = await getProfileStats(userId);
  return {
    id: user.id,
    name: user.name,
    university: user.university,
    department: user.department,
    studentId: isOwner ? user.studentId : null,
    bio: user.bio,
    email: isOwner || user.showEmail ? user.email : null,
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt,
    lastLoginAt: isOwner ? user.lastLoginAt : null,
    theme: normalizeThemeMode(user.theme),
    editorFontSize: user.editorFontSize,
    profilePublic: user.profilePublic,
    showEmail: user.showEmail,
    stats,
  };
}

export async function getUserSubmissions(
  userId: string,
  opts?: { take?: number; skip?: number }
) {
  const take = opts?.take ?? 40;
  const skip = opts?.skip ?? 0;
  const [rows, total] = await Promise.all([
    prisma.submission.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        problemId: true,
        contestId: true,
        verdict: true,
        timeMs: true,
        language: true,
        createdAt: true,
        contest: { select: { slug: true, title: true } },
      },
    }),
    prisma.submission.count({ where: { userId } }),
  ]);

  return {
    total,
    items: rows.map((r) => {
      const p = getProblem(r.problemId);
      return {
        ...r,
        title: p?.title ?? r.problemId,
        difficulty: p?.difficulty ?? null,
      };
    }),
  };
}

