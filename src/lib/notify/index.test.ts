import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: { createMany: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/log", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("./channels/inapp", () => ({ publishInApp: vi.fn() }));
vi.mock("./queue", () => ({ enqueueNotifyDelivery: vi.fn() }));
vi.mock("./digest", () => ({ digestEnabledUserIds: vi.fn().mockResolvedValue(new Set()) }));

import { prisma } from "@/lib/db";
import { publishInApp } from "./channels/inapp";
import { enqueueNotifyDelivery } from "./queue";
import { digestEnabledUserIds } from "./digest";
import { notify } from "./index";

describe("notify()", () => {
  beforeEach(() => vi.resetAllMocks());

  it("falls back to the type's default channels when no preference row exists", async () => {
    vi.mocked(prisma.notification.createMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([]);
    vi.mocked(digestEnabledUserIds).mockResolvedValue(new Set());

    // badge:earned defaults to INAPP only.
    await notify("u1", "badge:earned", { badgeName: "First Blood" });

    expect(publishInApp).toHaveBeenCalledTimes(1);
    expect(enqueueNotifyDelivery).not.toHaveBeenCalled();
  });

  it("an explicit off preference wins over the type default", async () => {
    vi.mocked(prisma.notification.createMany).mockResolvedValue({ count: 1 } as never);
    // teacher:approved defaults to INAPP+EMAIL — override to INAPP only.
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { userId: "u1", channels: ["INAPP"] },
    ] as never);
    vi.mocked(digestEnabledUserIds).mockResolvedValue(new Set());

    await notify("u1", "teacher:approved", {});

    expect(publishInApp).toHaveBeenCalledTimes(1);
    expect(enqueueNotifyDelivery).not.toHaveBeenCalled();
  });

  it("respects an explicit preference that ADDS a channel beyond the default", async () => {
    vi.mocked(prisma.notification.createMany).mockResolvedValue({ count: 1 } as never);
    // badge:earned defaults to INAPP only — override to include PUSH.
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { userId: "u1", channels: ["INAPP", "PUSH"] },
    ] as never);
    vi.mocked(digestEnabledUserIds).mockResolvedValue(new Set());

    await notify("u1", "badge:earned", { badgeName: "x" });

    expect(enqueueNotifyDelivery).toHaveBeenCalledTimes(1);
    expect(enqueueNotifyDelivery).toHaveBeenCalledWith(expect.objectContaining({ channel: "PUSH" }));
  });

  it("a bulk call creates one createMany and at most one delivery job per channel", async () => {
    const userIds = Array.from({ length: 500 }, (_, i) => `u${i}`);
    vi.mocked(prisma.notification.createMany).mockResolvedValue({ count: 500 } as never);
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([]);
    vi.mocked(digestEnabledUserIds).mockResolvedValue(new Set());

    // contest:starting defaults to INAPP+EMAIL+PUSH.
    await notify(userIds, "contest:starting", { contestTitle: "Fall Cup", contestSlug: "fall-cup" });

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ userId: "u0" })]) })
    );
    // EMAIL + PUSH — INAPP is synchronous pubsub, not a queued job.
    expect(enqueueNotifyDelivery).toHaveBeenCalledTimes(2);
  });

  it("digest-enabled users are excluded from the immediate EMAIL job", async () => {
    vi.mocked(prisma.notification.createMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([]);
    vi.mocked(digestEnabledUserIds).mockResolvedValue(new Set(["u1"]));

    await notify(["u1", "u2"], "contest:starting", { contestTitle: "Cup", contestSlug: "cup" });

    const emailCall = vi.mocked(enqueueNotifyDelivery).mock.calls.find((c) => c[0].channel === "EMAIL");
    expect(emailCall?.[0].userIds).toEqual(["u2"]);
  });

  it("never throws even when the database call fails", async () => {
    vi.mocked(prisma.notification.createMany).mockRejectedValue(new Error("db down"));
    await expect(notify("u1", "badge:earned", {})).resolves.toBeUndefined();
  });
});
