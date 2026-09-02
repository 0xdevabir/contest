import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  prisma: {
    solvedProblem: { groupBy: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));
vi.mock("./problems", () => ({
  getMeta: vi.fn(() => ({ total: 100 })),
  getProblem: vi.fn((id: string) => {
    const map: Record<string, { difficulty: string }> = {
      p1: { difficulty: "EASY" },
      p2: { difficulty: "HARD" },
      p3: { difficulty: "HARD" },
    };
    return map[id];
  }),
}));

import { getPracticeLeaderboard, TIER_POINTS } from "./leaderboard";
import { prisma } from "./db";

describe("getPracticeLeaderboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty stats with no solves", async () => {
    vi.mocked(prisma.solvedProblem.groupBy).mockResolvedValue([]);
    const result = await getPracticeLeaderboard();
    expect(result.rows).toEqual([]);
    expect(result.stats.solvers).toBe(0);
    expect(result.stats.totalProblems).toBe(100);
  });

  it("counts tiers per user and computes weighted points", async () => {
    vi.mocked(prisma.solvedProblem.groupBy).mockResolvedValue([
      { userId: "u1", _count: { problemId: 2 }, _max: { firstSolvedAt: new Date() } },
      { userId: "u2", _count: { problemId: 1 }, _max: { firstSolvedAt: new Date() } },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u1", name: "Ada", institutionId: "diu", institution: { slug: "diu", shortName: "DIU" } },
      { id: "u2", name: "Linus", institutionId: "nsu", institution: { slug: "nsu", shortName: "NSU" } },
    ] as never);
    vi.mocked(prisma.solvedProblem.findMany).mockResolvedValue([
      { userId: "u1", problemId: "p1" },
      { userId: "u1", problemId: "p2" },
      { userId: "u2", problemId: "p3" },
    ] as never);

    const result = await getPracticeLeaderboard();
    const ada = result.rows.find((r) => r.name === "Ada")!;
    expect(ada.byTier.EASY).toBe(1);
    expect(ada.byTier.HARD).toBe(1);
    expect(ada.points).toBe(TIER_POINTS.EASY + TIER_POINTS.HARD);
    expect(ada.topTier).toBe("HARD");
  });

  it("sorts by solved desc by default, tie-broken by earlier last solve", async () => {
    const earlier = new Date("2026-01-01T00:00:00Z");
    const later = new Date("2026-01-02T00:00:00Z");
    vi.mocked(prisma.solvedProblem.groupBy).mockResolvedValue([
      { userId: "u1", _count: { problemId: 1 }, _max: { firstSolvedAt: later } },
      { userId: "u2", _count: { problemId: 1 }, _max: { firstSolvedAt: earlier } },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u1", name: "Late", institutionId: "diu", institution: { slug: "diu", shortName: "DIU" } },
      { id: "u2", name: "Early", institutionId: "diu", institution: { slug: "diu", shortName: "DIU" } },
    ] as never);
    vi.mocked(prisma.solvedProblem.findMany).mockResolvedValue([] as never);

    const result = await getPracticeLeaderboard();
    expect(result.rows[0].name).toBe("Early");
    expect(result.rows[1].name).toBe("Late");
  });

  it("sorts by points when sort='points'", async () => {
    vi.mocked(prisma.solvedProblem.groupBy).mockResolvedValue([
      { userId: "u1", _count: { problemId: 3 }, _max: { firstSolvedAt: new Date() } },
      { userId: "u2", _count: { problemId: 1 }, _max: { firstSolvedAt: new Date() } },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u1", name: "Volume", institutionId: "diu", institution: { slug: "diu", shortName: "DIU" } },
      { id: "u2", name: "Depth", institutionId: "diu", institution: { slug: "diu", shortName: "DIU" } },
    ] as never);
    vi.mocked(prisma.solvedProblem.findMany).mockResolvedValue([
      { userId: "u1", problemId: "p1" },
      { userId: "u1", problemId: "p1" },
      { userId: "u1", problemId: "p1" },
      { userId: "u2", problemId: "p2" },
    ] as never);

    const result = await getPracticeLeaderboard({ sort: "points" });
    expect(result.rows[0].name).toBe("Depth");
  });

  it("filters candidate rows by institution but keeps global stats unfiltered", async () => {
    vi.mocked(prisma.solvedProblem.groupBy).mockResolvedValue([
      { userId: "u1", _count: { problemId: 1 }, _max: { firstSolvedAt: new Date() } },
      { userId: "u2", _count: { problemId: 1 }, _max: { firstSolvedAt: new Date() } },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u1", name: "DiuUser", institutionId: "diu", institution: { slug: "diu", shortName: "DIU" } },
      { id: "u2", name: "NsuUser", institutionId: "nsu", institution: { slug: "nsu", shortName: "NSU" } },
    ] as never);
    vi.mocked(prisma.solvedProblem.findMany).mockResolvedValue([] as never);

    const result = await getPracticeLeaderboard({ institutionId: "diu" });
    expect(result.rows.map((r) => r.name)).toEqual(["DiuUser"]);
    expect(result.stats.byInstitution.length).toBe(2);
  });

  it("verifiedOnly excludes unverified members from rows", async () => {
    vi.mocked(prisma.solvedProblem.groupBy).mockResolvedValue([
      { userId: "u1", _count: { problemId: 1 }, _max: { firstSolvedAt: new Date() } },
      { userId: "u2", _count: { problemId: 1 }, _max: { firstSolvedAt: new Date() } },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "u1",
        name: "Verified",
        institutionId: "diu",
        institutionVerifiedAt: new Date(),
        institution: { slug: "diu", shortName: "DIU" },
      },
      {
        id: "u2",
        name: "Unverified",
        institutionId: "diu",
        institutionVerifiedAt: null,
        institution: { slug: "diu", shortName: "DIU" },
      },
    ] as never);
    vi.mocked(prisma.solvedProblem.findMany).mockResolvedValue([] as never);

    const result = await getPracticeLeaderboard({ verifiedOnly: true });
    expect(result.rows.map((r) => r.name)).toEqual(["Verified"]);
  });
});
