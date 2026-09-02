import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./db", () => ({
  prisma: {
    userStreak: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("./log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { prisma } from "./db";
import { dayKey, recordSolveForStreak } from "./streaks";

function row(overrides: Partial<{ current: number; longest: number; lastSolveDay: Date | null; freezes: number; timezone: string }>) {
  return {
    userId: "u1",
    current: 0,
    longest: 0,
    lastSolveDay: null,
    freezes: 0,
    timezone: "Asia/Dhaka",
    ...overrides,
  };
}

describe("dayKey", () => {
  it("keeps 11pm Dhaka time on the same calendar day even though UTC has rolled over", () => {
    // 2026-03-05 23:00 in Asia/Dhaka (UTC+6) is 2026-03-05 17:00 UTC.
    const d = new Date("2026-03-05T17:00:00.000Z");
    expect(dayKey(d, "Asia/Dhaka")).toBe("2026-03-05");
    // The same instant read in UTC would be a different day near midnight —
    // e.g. 2026-03-05T23:30 Dhaka is 2026-03-05T17:30 UTC (still same day),
    // but 2026-03-06T04:00 Dhaka (past UTC midnight) must still be "06".
    const late = new Date("2026-03-05T22:00:00.000Z"); // 2026-03-06 04:00 Dhaka
    expect(dayKey(late, "Asia/Dhaka")).toBe("2026-03-06");
    expect(dayKey(late, "UTC")).toBe("2026-03-05");
  });
});

describe("recordSolveForStreak", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts a fresh streak at 1 for a first-ever solve", async () => {
    vi.mocked(prisma.userStreak.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.userStreak.create).mockImplementation((async (args: { data: Record<string, unknown> }) => ({ ...row({}), ...args.data })) as never);

    const result = await recordSolveForStreak("u1", new Date("2026-03-05T10:00:00Z"));
    expect(result).toEqual({ current: 1, longest: 1, freezes: 0, advanced: true, usedFreeze: false });
  });

  it("does not advance the streak twice for two solves on the same day", async () => {
    vi.mocked(prisma.userStreak.findUnique).mockResolvedValue(
      row({ current: 3, longest: 5, lastSolveDay: new Date("2026-03-05T00:00:00Z") }) as never
    );
    const result = await recordSolveForStreak("u1", new Date("2026-03-05T10:00:00Z"));
    expect(result?.advanced).toBe(false);
    expect(result?.current).toBe(3);
    expect(prisma.userStreak.update).not.toHaveBeenCalled();
  });

  it("advances the streak by one on the very next day", async () => {
    vi.mocked(prisma.userStreak.findUnique).mockResolvedValue(
      row({ current: 3, longest: 5, lastSolveDay: new Date("2026-03-05T00:00:00Z") }) as never
    );
    vi.mocked(prisma.userStreak.update).mockImplementation((async (args: { data: Record<string, unknown> }) => ({ ...row({}), ...args.data })) as never);

    const result = await recordSolveForStreak("u1", new Date("2026-03-06T10:00:00Z"));
    expect(result).toMatchObject({ current: 4, longest: 5, advanced: true, usedFreeze: false });
  });

  it("consumes a held freeze to bridge exactly one missed day", async () => {
    vi.mocked(prisma.userStreak.findUnique).mockResolvedValue(
      row({ current: 6, longest: 6, freezes: 1, lastSolveDay: new Date("2026-03-05T00:00:00Z") }) as never
    );
    vi.mocked(prisma.userStreak.update).mockImplementation((async (args: { data: Record<string, unknown> }) => ({ ...row({}), ...args.data })) as never);

    // Missed 2026-03-06 entirely, solves again on 2026-03-07.
    const result = await recordSolveForStreak("u1", new Date("2026-03-07T10:00:00Z"));
    expect(result).toMatchObject({ current: 7, usedFreeze: true, freezes: 1 }); // consumed one, earned one back at day 7
  });

  it("breaks the streak on a gap without a held freeze", async () => {
    vi.mocked(prisma.userStreak.findUnique).mockResolvedValue(
      row({ current: 6, longest: 6, freezes: 0, lastSolveDay: new Date("2026-03-05T00:00:00Z") }) as never
    );
    vi.mocked(prisma.userStreak.update).mockImplementation((async (args: { data: Record<string, unknown> }) => ({ ...row({}), ...args.data })) as never);

    const result = await recordSolveForStreak("u1", new Date("2026-03-07T10:00:00Z"));
    expect(result).toMatchObject({ current: 1, usedFreeze: false });
  });

  it("earns a freeze every 7-day streak, capped at 2", async () => {
    vi.mocked(prisma.userStreak.findUnique).mockResolvedValue(
      row({ current: 13, longest: 13, freezes: 2, lastSolveDay: new Date("2026-03-05T00:00:00Z") }) as never
    );
    vi.mocked(prisma.userStreak.update).mockImplementation((async (args: { data: Record<string, unknown> }) => ({ ...row({}), ...args.data })) as never);

    const result = await recordSolveForStreak("u1", new Date("2026-03-06T10:00:00Z"));
    expect(result?.current).toBe(14);
    expect(result?.freezes).toBe(2); // stays capped, doesn't grow to 3
  });
});
