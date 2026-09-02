import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./db", () => ({
  prisma: { featureFlag: { findUnique: vi.fn() } },
}));
vi.mock("./log", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("isEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FLAGS_JUDGE_V2;
    delete process.env.FLAGS_TEACHER_ROLE;
  });

  it("an env var of '1' force-enables regardless of the DB", async () => {
    process.env.FLAGS_JUDGE_V2 = "1";
    const { isEnabled } = await import("./flags");
    expect(await isEnabled("judgeV2")).toBe(true);
  });

  it("an env var of '0' force-disables regardless of the DB", async () => {
    process.env.FLAGS_JUDGE_V2 = "0";
    const { isEnabled } = await import("./flags");
    const { prisma } = await import("./db");
    vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue({
      key: "judgeV2",
      enabled: true,
      rolloutPercent: 100,
      allowRoles: [],
      note: "",
      updatedAt: new Date(),
    });
    expect(await isEnabled("judgeV2")).toBe(false);
  });

  it("defaults to false when no env var and no DB row", async () => {
    const { isEnabled } = await import("./flags");
    const { prisma } = await import("./db");
    vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue(null);
    expect(await isEnabled("teacherRole")).toBe(false);
  });

  it("resolves from a DB row when enabled and fully rolled out", async () => {
    const { isEnabled } = await import("./flags");
    const { prisma } = await import("./db");
    vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue({
      key: "teacherRole",
      enabled: true,
      rolloutPercent: 100,
      allowRoles: [],
      note: "",
      updatedAt: new Date(),
    });
    expect(await isEnabled("teacherRole", { userId: "u1", role: "STUDENT" })).toBe(true);
  });

  it("respects allowRoles gating", async () => {
    const { isEnabled } = await import("./flags");
    const { prisma } = await import("./db");
    vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue({
      key: "teacherRole",
      enabled: true,
      rolloutPercent: 100,
      allowRoles: ["ADMIN"],
      note: "",
      updatedAt: new Date(),
    });
    expect(await isEnabled("teacherRole", { userId: "u1", role: "STUDENT" })).toBe(false);
    expect(await isEnabled("teacherRole", { userId: "u1", role: "ADMIN" })).toBe(true);
  });

  it("denies a rollout percentage of 0 with no userId", async () => {
    const { isEnabled } = await import("./flags");
    const { prisma } = await import("./db");
    vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue({
      key: "teacherRole",
      enabled: true,
      rolloutPercent: 0,
      allowRoles: [],
      note: "",
      updatedAt: new Date(),
    });
    expect(await isEnabled("teacherRole")).toBe(false);
  });

  it("fails closed when the DB lookup throws", async () => {
    const { isEnabled } = await import("./flags");
    const { prisma } = await import("./db");
    vi.mocked(prisma.featureFlag.findUnique).mockRejectedValue(new Error("db down"));
    expect(await isEnabled("teacherRole")).toBe(false);
  });
});
