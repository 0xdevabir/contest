import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeFreezeAt } from "./contest-lifecycle";

vi.mock("./db", () => ({
  prisma: {
    contest: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    contestRegistration: { findMany: vi.fn() },
    contestProblem: { findMany: vi.fn() },
    submission: { findMany: vi.fn(), count: vi.fn() },
    contestStandingSnapshot: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("./problems", () => ({ getProblem: vi.fn(() => Promise.resolve(null)) }));
vi.mock("./autoscale", () => ({ ensureWorkerCapacity: vi.fn(() => Promise.resolve()) }));

import { prisma } from "./db";
import { ensureWorkerCapacity } from "./autoscale";
import { drainAndFinalizeContests, freezeDueContests, prewarmUpcomingContests, snapshotContest } from "./contest-lifecycle";

describe("computeFreezeAt", () => {
  it("subtracts freezeMinutes from endsAt", () => {
    const endsAt = new Date("2026-01-01T12:00:00Z");
    const freezeAt = computeFreezeAt(endsAt, { freezeMinutes: 60 });
    expect(freezeAt?.toISOString()).toBe("2026-01-01T11:00:00.000Z");
  });
  it("returns null with no endsAt or a zero freeze window", () => {
    expect(computeFreezeAt(null, { freezeMinutes: 60 })).toBeNull();
    expect(computeFreezeAt(new Date(), { freezeMinutes: 0 })).toBeNull();
  });
});

function mockContestForSnapshot(overrides: Partial<{ startsAt: Date | null; endsAt: Date | null; rules: unknown }> = {}) {
  vi.mocked(prisma.contest.findUnique).mockResolvedValue({
    id: "c1",
    startsAt: new Date("2026-01-01T10:00:00Z"),
    endsAt: new Date("2026-01-01T12:00:00Z"),
    rules: { freezeMinutes: 30 },
    createdAt: new Date("2026-01-01T09:00:00Z"),
    ...overrides,
  } as never);
  vi.mocked(prisma.contestRegistration.findMany).mockResolvedValue([]);
  vi.mocked(prisma.contestProblem.findMany).mockResolvedValue([]);
  vi.mocked(prisma.submission.findMany).mockResolvedValue([]);
  vi.mocked(prisma.contestStandingSnapshot.findFirst).mockResolvedValue(null);
}

describe("snapshotContest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes version 1 when no prior snapshot exists", async () => {
    mockContestForSnapshot();
    await snapshotContest("c1", "final");
    expect(prisma.contestStandingSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contestId: "c1", version: 1, reason: "final" }) })
    );
  });

  it("increments past the highest existing version, never overwriting", async () => {
    mockContestForSnapshot();
    vi.mocked(prisma.contestStandingSnapshot.findFirst).mockResolvedValue({ version: 3 } as never);
    await snapshotContest("c1", "rejudge");
    expect(prisma.contestStandingSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 4 }) })
    );
  });
});

describe("freezeDueContests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("freezes a LIVE contest once its freeze window opens, but only once", async () => {
    vi.mocked(prisma.contest.findMany).mockResolvedValue([
      { id: "c1", endsAt: new Date(Date.now() - 1000), rules: { freezeMinutes: 60 } },
    ] as never);
    mockContestForSnapshot({ endsAt: new Date(Date.now() - 1000) });
    vi.mocked(prisma.contestStandingSnapshot.findFirst).mockResolvedValue(null);

    const frozen = await freezeDueContests();
    expect(frozen).toBe(1);
    expect(prisma.contestStandingSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "freeze" }) })
    );
  });

  it("skips a contest that's already been frozen", async () => {
    vi.mocked(prisma.contest.findMany).mockResolvedValue([
      { id: "c1", endsAt: new Date(Date.now() - 1000), rules: { freezeMinutes: 60 } },
    ] as never);
    vi.mocked(prisma.contestStandingSnapshot.findFirst).mockResolvedValue({ id: "existing" } as never);

    const frozen = await freezeDueContests();
    expect(frozen).toBe(0);
    expect(prisma.contestStandingSnapshot.create).not.toHaveBeenCalled();
  });
});

describe("drainAndFinalizeContests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("finalizes immediately when the queue is already empty", async () => {
    vi.mocked(prisma.contest.findMany).mockResolvedValue([{ id: "c1" }] as never);
    vi.mocked(prisma.contestStandingSnapshot.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.submission.count).mockResolvedValue(0);
    mockContestForSnapshot();

    const promise = drainAndFinalizeContests();
    const finalized = await promise;

    expect(finalized).toBe(1);
    expect(prisma.contest.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "ENDED" } });
    expect(prisma.contestStandingSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: "final" }),
      })
    );
    const created = vi.mocked(prisma.contestStandingSnapshot.create).mock.calls[0][0] as unknown as {
      data: { standings: { partial: boolean } };
    };
    expect(created.data.standings.partial).toBe(false);
  });

  it("waits for in-flight submissions to drain before snapshotting", async () => {
    vi.mocked(prisma.contest.findMany).mockResolvedValue([{ id: "c1" }] as never);
    vi.mocked(prisma.contestStandingSnapshot.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.submission.count).mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    mockContestForSnapshot();

    const promise = drainAndFinalizeContests();
    await vi.advanceTimersByTimeAsync(3_000);
    const finalized = await promise;

    expect(finalized).toBe(1);
    expect(prisma.submission.count).toHaveBeenCalledTimes(2);
  });

  it("marks the snapshot partial when the drain times out at 120s", async () => {
    vi.mocked(prisma.contest.findMany).mockResolvedValue([{ id: "c1" }] as never);
    vi.mocked(prisma.contestStandingSnapshot.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.submission.count).mockResolvedValue(1); // never drains
    mockContestForSnapshot();

    const promise = drainAndFinalizeContests();
    await vi.advanceTimersByTimeAsync(121_000);
    const finalized = await promise;

    expect(finalized).toBe(1);
    const created = vi.mocked(prisma.contestStandingSnapshot.create).mock.calls[0][0] as unknown as {
      data: { standings: { partial: boolean } };
    };
    expect(created.data.standings.partial).toBe(true);
  });
});

describe("prewarmUpcomingContests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls ensureWorkerCapacity for a large upcoming contest", async () => {
    vi.mocked(prisma.contest.findMany).mockResolvedValue([
      {
        id: "c1",
        slug: "midterm",
        title: "Midterm",
        startsAt: new Date(Date.now() + 5 * 60_000),
        participantCount: 120,
      },
    ] as never);

    const count = await prewarmUpcomingContests();

    expect(count).toBe(1);
    expect(ensureWorkerCapacity).toHaveBeenCalledWith(2, "contest pre-warm: midterm");
  });

  it("passes the >50-participant / 15-minute window filter to the query", async () => {
    vi.mocked(prisma.contest.findMany).mockResolvedValue([]);

    const count = await prewarmUpcomingContests();

    expect(count).toBe(0);
    expect(ensureWorkerCapacity).not.toHaveBeenCalled();
    expect(prisma.contest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "SCHEDULED",
          participantCount: { gt: 50 },
        }),
      })
    );
  });

  it("never throws when the lookup fails", async () => {
    vi.mocked(prisma.contest.findMany).mockRejectedValue(new Error("db down"));
    await expect(prewarmUpcomingContests()).resolves.toBe(0);
  });
});
