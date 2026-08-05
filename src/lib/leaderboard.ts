import type { University } from "@prisma/client";
import { prisma } from "./db";

export type LeaderboardRow = {
  rank: number;
  userId: string;
  name: string;
  university: University;
  solved: number;
  lastSolveAt: Date | null;
};

export async function getPracticeLeaderboard(opts?: {
  university?: University;
  limit?: number;
}): Promise<LeaderboardRow[]> {
  const limit = opts?.limit ?? 100;

  const grouped = await prisma.solvedProblem.groupBy({
    by: ["userId"],
    _count: { problemId: true },
    _max: { firstSolvedAt: true },
    orderBy: [{ _count: { problemId: "desc" } }, { _max: { firstSolvedAt: "asc" } }],
    take: limit * 3,
  });

  if (!grouped.length) return [];

  const users = await prisma.user.findMany({
    where: {
      id: { in: grouped.map((g) => g.userId) },
      ...(opts?.university ? { university: opts.university } : {}),
    },
    select: { id: true, name: true, university: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const rows: LeaderboardRow[] = [];
  for (const g of grouped) {
    const u = byId.get(g.userId);
    if (!u) continue;
    rows.push({
      rank: 0,
      userId: u.id,
      name: u.name,
      university: u.university,
      solved: g._count.problemId,
      lastSolveAt: g._max.firstSolvedAt,
    });
    if (rows.length >= limit) break;
  }

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export type ContestStanding = {
  rank: number;
  userId: string;
  name: string;
  university: University;
  solved: number;
  penalty: number;
  lastAcAt: Date | null;
};

export async function getContestLeaderboard(
  contestId: string,
  opts?: { university?: University; freezeAt?: Date | null }
): Promise<ContestStanding[]> {
  const regs = await prisma.contestRegistration.findMany({
    where: { contestId },
    include: {
      user: { select: { id: true, name: true, university: true } },
    },
  });

  const filtered = opts?.university
    ? regs.filter((r) => r.user.university === opts.university)
    : regs;

  const problems = await prisma.contestProblem.findMany({
    where: { contestId },
    select: { problemId: true, points: true },
  });
  const problemIds = problems.map((p) => p.problemId);

  const submissions = await prisma.submission.findMany({
    where: {
      contestId,
      problemId: { in: problemIds },
      ...(opts?.freezeAt ? { createdAt: { lte: opts.freezeAt } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true,
      problemId: true,
      verdict: true,
      createdAt: true,
    },
  });

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  const rules = (contest?.rules ?? {}) as { penaltyPerWrong?: number };
  const penaltyPerWrong = rules.penaltyPerWrong ?? 20;
  const start = contest?.startsAt?.getTime() ?? contest?.createdAt.getTime() ?? 0;

  type Acc = {
    solved: Set<string>;
    wrong: Map<string, number>;
    lastAcAt: Date | null;
    penalty: number;
  };

  const byUser = new Map<string, Acc>();
  for (const r of filtered) {
    byUser.set(r.userId, {
      solved: new Set(),
      wrong: new Map(),
      lastAcAt: null,
      penalty: 0,
    });
  }

  for (const s of submissions) {
    if (!s.userId) continue;
    const acc = byUser.get(s.userId);
    if (!acc || acc.solved.has(s.problemId)) continue;
    if (s.verdict === "AC") {
      const wrongs = acc.wrong.get(s.problemId) ?? 0;
      const minutes = Math.max(0, Math.floor((s.createdAt.getTime() - start) / 60000));
      acc.penalty += minutes + wrongs * penaltyPerWrong;
      acc.solved.add(s.problemId);
      acc.lastAcAt = s.createdAt;
    } else if (["WA", "RE", "TLE", "MLE"].includes(s.verdict)) {
      acc.wrong.set(s.problemId, (acc.wrong.get(s.problemId) ?? 0) + 1);
    }
  }

  const standings: ContestStanding[] = filtered.map((r) => {
    const acc = byUser.get(r.userId)!;
    return {
      rank: 0,
      userId: r.user.id,
      name: r.user.name,
      university: r.user.university,
      solved: acc.solved.size,
      penalty: acc.penalty,
      lastAcAt: acc.lastAcAt,
    };
  });

  standings.sort((a, b) => {
    if (b.solved !== a.solved) return b.solved - a.solved;
    if (a.penalty !== b.penalty) return a.penalty - b.penalty;
    return (a.lastAcAt?.getTime() ?? 0) - (b.lastAcAt?.getTime() ?? 0);
  });

  return standings.map((s, i) => ({ ...s, rank: i + 1 }));
}
