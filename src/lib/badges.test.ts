import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./db", () => ({
  prisma: {
    badge: { findMany: vi.fn() },
    userBadge: { create: vi.fn() },
    solvedProblem: { count: vi.fn() },
    submission: { count: vi.fn() },
    contestStandingSnapshot: { findFirst: vi.fn() },
    userStreak: { findMany: vi.fn() },
    userRating: { findMany: vi.fn() },
    tag: { findUnique: vi.fn() },
    userTagStat: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("./log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { prisma } from "./db";
import { evaluateContestEndedBadges, evaluateNightlyBadges, evaluateSubmissionJudgedBadges } from "./badges";

function badge(id: string, rule: unknown) {
  return { id, code: id, name: id, nameBn: null, description: "", icon: "star", tier: "bronze", rule, hidden: false };
}

describe("evaluateSubmissionJudgedBadges", () => {
  beforeEach(() => vi.resetAllMocks());

  it("awards a solve_count badge once the threshold is reached", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badge("b-100", { type: "solve_count", threshold: 100 })] as never);
    vi.mocked(prisma.solvedProblem.count).mockResolvedValue(100 as never);

    await evaluateSubmissionJudgedBadges({ userId: "u1", problemId: "p1", verdict: "AC", createdAt: new Date() });

    expect(prisma.userBadge.create).toHaveBeenCalledWith({
      data: { userId: "u1", badgeId: "b-100", context: { solvedCount: 100 } },
    });
  });

  it("does not award a solve_count badge below its boundary", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badge("b-100", { type: "solve_count", threshold: 100 })] as never);
    vi.mocked(prisma.solvedProblem.count).mockResolvedValue(99 as never);

    await evaluateSubmissionJudgedBadges({ userId: "u1", problemId: "p1", verdict: "AC", createdAt: new Date() });

    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });

  it("does nothing for a non-AC verdict", async () => {
    await evaluateSubmissionJudgedBadges({ userId: "u1", problemId: "p1", verdict: "WA", createdAt: new Date() });
    expect(prisma.badge.findMany).not.toHaveBeenCalled();
  });

  it("treats a duplicate award (unique violation) as a no-op, not an error", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badge("b-100", { type: "solve_count", threshold: 100 })] as never);
    vi.mocked(prisma.solvedProblem.count).mockResolvedValue(100 as never);
    vi.mocked(prisma.userBadge.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));

    await expect(
      evaluateSubmissionJudgedBadges({ userId: "u1", problemId: "p1", verdict: "AC", createdAt: new Date() })
    ).resolves.toBeUndefined();
  });

  it("awards first_ac_of_problem only when no earlier AC exists", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badge("b-first", { type: "first_ac_of_problem" })] as never);
    vi.mocked(prisma.solvedProblem.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.submission.count).mockResolvedValue(0 as never);

    await evaluateSubmissionJudgedBadges({
      userId: "u1",
      problemId: "p1",
      problemRefId: "ref1",
      verdict: "AC",
      createdAt: new Date(),
    });

    expect(prisma.userBadge.create).toHaveBeenCalledWith({
      data: { userId: "u1", badgeId: "b-first", context: { problemId: "p1" } },
    });
  });

  it("awards a comeback badge once failed attempts reach the boundary", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badge("b-comeback", { type: "comeback", attempts: 5 })] as never);
    vi.mocked(prisma.solvedProblem.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.submission.count).mockResolvedValue(5 as never);

    await evaluateSubmissionJudgedBadges({ userId: "u1", problemId: "p1", verdict: "AC", createdAt: new Date() });

    expect(prisma.userBadge.create).toHaveBeenCalledWith({
      data: { userId: "u1", badgeId: "b-comeback", context: { attempts: 5 } },
    });
  });
});

describe("evaluateContestEndedBadges", () => {
  beforeEach(() => vi.resetAllMocks());

  it("awards top-3 badges only when the field is large enough", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([
      badge("top3", { type: "contest_rank", max: 3, minField: 20 }),
    ] as never);
    vi.mocked(prisma.contestStandingSnapshot.findFirst).mockResolvedValue({
      id: "snap1",
      standings: {
        rows: Array.from({ length: 25 }, (_, i) => ({ userId: `u${i}`, rank: i + 1 })),
      },
    } as never);

    await evaluateContestEndedBadges("c1");

    expect(prisma.userBadge.create).toHaveBeenCalledTimes(3);
    expect(prisma.userBadge.create).toHaveBeenCalledWith({
      data: { userId: "u0", badgeId: "top3", context: { contestId: "c1", rank: 1, fieldSize: 25 } },
    });
  });

  it("skips rank badges when the field is smaller than minField", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([
      badge("top3", { type: "contest_rank", max: 3, minField: 20 }),
    ] as never);
    vi.mocked(prisma.contestStandingSnapshot.findFirst).mockResolvedValue({
      id: "snap1",
      standings: { rows: Array.from({ length: 5 }, (_, i) => ({ userId: `u${i}`, rank: i + 1 })) },
    } as never);

    await evaluateContestEndedBadges("c1");

    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });
});

describe("evaluateNightlyBadges", () => {
  beforeEach(() => vi.resetAllMocks());

  it("awards a streak badge to users at or above the day threshold", async () => {
    vi.mocked(prisma.badge.findMany).mockImplementation((async (args: { where?: { rule?: { equals?: string } } }) => {
      if (args?.where?.rule?.equals === "streak") return [badge("streak-30", { type: "streak", days: 30 })];
      return [];
    }) as never);
    vi.mocked(prisma.userStreak.findMany).mockResolvedValue([
      { userId: "a", current: 30 },
      { userId: "b", current: 29 },
    ] as never);

    const result = await evaluateNightlyBadges();

    expect(result.awarded).toBe(1);
    expect(prisma.userBadge.create).toHaveBeenCalledWith({
      data: { userId: "a", badgeId: "streak-30", context: { days: 30 } },
    });
  });
});
