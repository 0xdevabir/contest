import type { University } from "@prisma/client";
import { prisma } from "./db";
import { DIFFICULTY_ORDER } from "./difficulty";
import { getMeta, getProblem } from "./problems";
import type { Difficulty } from "./types";

/** Time windows the leaderboard can be scoped to. */
export type LeaderboardRange = "all" | "month" | "week";

/** What the standings are ordered by. */
export type LeaderboardSort = "solved" | "points";

/**
 * Rating weights per tier. Solving an Extreme problem should not count the same
 * as a Very Easy one, so the points column rewards depth over volume.
 */
export const TIER_POINTS: Record<Difficulty, number> = {
  "VERY EASY": 1,
  EASY: 2,
  MEDIUM: 4,
  "MEDIUM-HARD": 6,
  HARD: 9,
  "VERY HARD": 13,
  EXTREME: 20,
};

export type LeaderboardRow = {
  rank: number;
  userId: string;
  name: string;
  university: University;
  solved: number;
  lastSolveAt: Date | null;
  /** Weighted rating from the tiers actually solved. */
  points: number;
  /** Solve count per difficulty tier, for the mix bar. */
  byTier: Record<Difficulty, number>;
  /** Hardest tier reached — a quick signal of depth. */
  topTier: Difficulty | null;
};

export type LeaderboardStats = {
  solvers: number;
  totalSolves: number;
  totalProblems: number;
  activeThisWeek: number;
  /** Aggregate standings per campus. */
  byUniversity: {
    code: University;
    solvers: number;
    solved: number;
  }[];
};

export type LeaderboardResult = {
  rows: LeaderboardRow[];
  stats: LeaderboardStats;
  /** Set when the signed-in user ranks outside the returned rows. */
  viewer: LeaderboardRow | null;
};

function emptyTiers(): Record<Difficulty, number> {
  return DIFFICULTY_ORDER.reduce(
    (acc, tier) => ({ ...acc, [tier]: 0 }),
    {} as Record<Difficulty, number>
  );
}

function cutoffFor(range: LeaderboardRange): Date | null {
  if (range === "all") return null;
  const days = range === "week" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Practice standings plus the aggregates the page needs.
 *
 * One groupBy drives both the ranking and the stats strip so the numbers can
 * never disagree with the table. Difficulty mixes are resolved from the JSON
 * problem bank rather than the database, which has no notion of tiers.
 */
export async function getPracticeLeaderboard(opts?: {
  university?: University;
  limit?: number;
  range?: LeaderboardRange;
  sort?: LeaderboardSort;
  viewerId?: string;
}): Promise<LeaderboardResult> {
  const limit = opts?.limit ?? 100;
  const range = opts?.range ?? "all";
  const sort = opts?.sort ?? "solved";
  const cutoff = cutoffFor(range);
  const where = cutoff ? { firstSolvedAt: { gte: cutoff } } : {};

  const grouped = await prisma.solvedProblem.groupBy({
    by: ["userId"],
    where,
    _count: { problemId: true },
    _max: { firstSolvedAt: true },
  });

  const totalProblems = getMeta().total ?? 0;

  if (!grouped.length) {
    return {
      rows: [],
      stats: {
        solvers: 0,
        totalSolves: 0,
        totalProblems,
        activeThisWeek: 0,
        byUniversity: [],
      },
      viewer: null,
    };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) }, status: "ACTIVE" },
    select: { id: true, name: true, university: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  // Campus aggregates and global totals are computed across everyone, not just
  // the filtered/visible slice, so the header numbers stay stable.
  const uniAgg = new Map<University, { solvers: number; solved: number }>();
  let totalSolves = 0;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let activeThisWeek = 0;

  const candidates: LeaderboardRow[] = [];
  for (const g of grouped) {
    const u = byId.get(g.userId);
    if (!u) continue;
    const solved = g._count.problemId;
    totalSolves += solved;
    const agg = uniAgg.get(u.university) ?? { solvers: 0, solved: 0 };
    agg.solvers += 1;
    agg.solved += solved;
    uniAgg.set(u.university, agg);
    if (g._max.firstSolvedAt && g._max.firstSolvedAt >= weekAgo) activeThisWeek += 1;

    if (opts?.university && u.university !== opts.university) continue;
    candidates.push({
      rank: 0,
      userId: u.id,
      name: u.name,
      university: u.university,
      solved,
      lastSolveAt: g._max.firstSolvedAt,
      points: 0,
      byTier: emptyTiers(),
      topTier: null,
    });
  }

  // Resolve tier mixes for the candidates we may display (plus the viewer).
  const ids = candidates.map((c) => c.userId);
  const solves = ids.length
    ? await prisma.solvedProblem.findMany({
        where: { userId: { in: ids }, ...where },
        select: { userId: true, problemId: true },
      })
    : [];

  const mix = new Map<string, Record<Difficulty, number>>();
  const points = new Map<string, number>();
  for (const s of solves) {
    const tier = getProblem(s.problemId)?.difficulty;
    if (!tier) continue;
    const tiers = mix.get(s.userId) ?? emptyTiers();
    tiers[tier] += 1;
    mix.set(s.userId, tiers);
    points.set(s.userId, (points.get(s.userId) ?? 0) + (TIER_POINTS[tier] ?? 1));
  }

  for (const row of candidates) {
    row.byTier = mix.get(row.userId) ?? emptyTiers();
    row.points = points.get(row.userId) ?? 0;
    // Hardest tier with at least one solve.
    for (let i = DIFFICULTY_ORDER.length - 1; i >= 0; i -= 1) {
      const tier = DIFFICULTY_ORDER[i];
      if (row.byTier[tier] > 0) {
        row.topTier = tier;
        break;
      }
    }
  }

  candidates.sort((a, b) => {
    if (sort === "points" && b.points !== a.points) return b.points - a.points;
    if (b.solved !== a.solved) return b.solved - a.solved;
    if (b.points !== a.points) return b.points - a.points;
    // Earlier finisher wins ties — same convention as contest standings.
    return (a.lastSolveAt?.getTime() ?? 0) - (b.lastSolveAt?.getTime() ?? 0);
  });

  const ranked = candidates.map((r, i) => ({ ...r, rank: i + 1 }));
  const rows = ranked.slice(0, limit);

  const viewerRow = opts?.viewerId
    ? ranked.find((r) => r.userId === opts.viewerId) ?? null
    : null;
  const viewerVisible = viewerRow
    ? rows.some((r) => r.userId === viewerRow.userId)
    : false;

  return {
    rows,
    stats: {
      solvers: ranked.length,
      totalSolves,
      totalProblems,
      activeThisWeek,
      byUniversity: [...uniAgg.entries()]
        .map(([code, v]) => ({ code, ...v }))
        .sort((a, b) => b.solved - a.solved),
    },
    viewer: viewerVisible ? null : viewerRow,
  };
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

