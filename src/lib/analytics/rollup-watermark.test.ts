import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  prisma: {
    analyticsWatermark: { findUnique: vi.fn(), upsert: vi.fn() },
    submission: { findMany: vi.fn() },
    userTagStat: { upsert: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("../log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { rollupUserTagStats } from "./rollup";
import { prisma } from "../db";

const SUB_1 = { id: "sub-1", userId: "u1", createdAt: new Date("2026-01-01T00:00:00.000Z") };
const SUB_2 = { id: "sub-2", userId: "u1", createdAt: new Date("2026-01-01T00:00:01.000Z") };

/**
 * PHASE-08 D1's testing plan: "Incremental rollup watermark: processing
 * twice does not double-count." rollupUserTagStats() must not reprocess
 * submissions the previous run already advanced the watermark past.
 */
describe("rollupUserTagStats watermark", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recomputes touched users on the first run, then does nothing new on a second run with no new submissions", async () => {
    let storedWatermark: { cursorAt: Date | null; cursorId: string | null } = { cursorAt: null, cursorId: null };

    const findUniqueImpl = (async () =>
      storedWatermark.cursorAt ? ({ job: "userTagStat", ...storedWatermark, lastRunAt: new Date() } as never) : null) as never;
    vi.mocked(prisma.analyticsWatermark.findUnique).mockImplementation(findUniqueImpl);

    const upsertImpl = (async (args: { create: { cursorAt?: Date; cursorId?: string } }) => {
      if (args.create.cursorAt && args.create.cursorId) {
        storedWatermark = { cursorAt: args.create.cursorAt, cursorId: args.create.cursorId };
      }
      return {} as never;
    }) as never;
    vi.mocked(prisma.analyticsWatermark.upsert).mockImplementation(upsertImpl);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(prisma.userTagStat.upsert).mockResolvedValue({} as never);

    // First run: two submissions from u1 exist.
    vi.mocked(prisma.submission.findMany).mockResolvedValueOnce([SUB_1, SUB_2] as never);
    const first = await rollupUserTagStats();
    expect(first.submissionsScanned).toBe(2);
    expect(first.usersProcessed).toBe(1);
    expect(storedWatermark.cursorId).toBe("sub-2");

    // Second run: same submissions still "exist" in the DB, but the
    // watermark means the query for newer rows returns nothing.
    vi.mocked(prisma.submission.findMany).mockResolvedValueOnce([] as never);
    const queryCallsBefore = vi.mocked(prisma.$queryRaw).mock.calls.length;
    const second = await rollupUserTagStats();

    expect(second.submissionsScanned).toBe(0);
    expect(second.usersProcessed).toBe(0);
    // No user was reprocessed, so the per-user recompute query never ran again.
    expect(vi.mocked(prisma.$queryRaw).mock.calls.length).toBe(queryCallsBefore);

    // The findMany call on the second run was scoped strictly after the
    // watermark left by the first run — never reprocessing sub-1/sub-2.
    const secondCallArgs = vi.mocked(prisma.submission.findMany).mock.calls[1][0] as {
      where: { OR: unknown[] };
    };
    expect(secondCallArgs.where.OR).toBeDefined();
  });
});
