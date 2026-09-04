import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../db", () => ({
  prisma: {
    aiBudget: { upsert: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "../db";
import { checkBudget, recordUsage } from "./budget";

function budget(overrides: Partial<{ monthlyCents: number; usedCents: number; hardStop: boolean; periodStart: Date }> = {}) {
  return {
    institutionId: "inst1",
    monthlyCents: 2000,
    usedCents: 0,
    hardStop: true,
    periodStart: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("checkBudget", () => {
  beforeEach(() => vi.resetAllMocks());

  it("is a no-op for an institution-less actor", async () => {
    await checkBudget(null);
    expect(prisma.aiBudget.upsert).not.toHaveBeenCalled();
  });

  it("passes when usage is below the monthly cap", async () => {
    vi.mocked(prisma.aiBudget.upsert).mockResolvedValue(budget({ usedCents: 500 }) as never);
    await expect(checkBudget("inst1", new Date("2026-01-15T00:00:00Z"))).resolves.toBeUndefined();
  });

  it("throws a RateLimitError once the hard-stop cap is reached", async () => {
    vi.mocked(prisma.aiBudget.upsert).mockResolvedValue(budget({ usedCents: 2000 }) as never);
    await expect(checkBudget("inst1", new Date("2026-01-15T00:00:00Z"))).rejects.toMatchObject({ status: 429 });
  });

  it("does not throw when over cap but hardStop is off", async () => {
    vi.mocked(prisma.aiBudget.upsert).mockResolvedValue(budget({ usedCents: 5000, hardStop: false }) as never);
    await expect(checkBudget("inst1", new Date("2026-01-15T00:00:00Z"))).resolves.toBeUndefined();
  });

  it("rolls a stale period over to zero before checking the cap", async () => {
    vi.mocked(prisma.aiBudget.upsert).mockResolvedValue(
      budget({ usedCents: 2000, periodStart: new Date("2025-12-01T00:00:00Z") }) as never
    );
    vi.mocked(prisma.aiBudget.update).mockResolvedValue(budget({ usedCents: 0 }) as never);

    await expect(checkBudget("inst1", new Date("2026-01-15T00:00:00Z"))).resolves.toBeUndefined();
    expect(prisma.aiBudget.update).toHaveBeenCalledWith({
      where: { institutionId: "inst1" },
      data: { usedCents: 0, periodStart: new Date("2026-01-01T00:00:00Z") },
    });
  });
});

describe("recordUsage", () => {
  beforeEach(() => vi.resetAllMocks());

  it("is a no-op for an institution-less actor or zero cost", async () => {
    await recordUsage(null, 10);
    await recordUsage("inst1", 0);
    expect(prisma.aiBudget.upsert).not.toHaveBeenCalled();
    expect(prisma.aiBudget.update).not.toHaveBeenCalled();
  });

  it("increments usedCents", async () => {
    vi.mocked(prisma.aiBudget.upsert).mockResolvedValue(budget() as never);
    vi.mocked(prisma.aiBudget.update).mockResolvedValue(budget({ usedCents: 42 }) as never);

    await recordUsage("inst1", 42, new Date("2026-01-15T00:00:00Z"));

    expect(prisma.aiBudget.update).toHaveBeenCalledWith({
      where: { institutionId: "inst1" },
      data: { usedCents: { increment: 42 } },
    });
  });
});
