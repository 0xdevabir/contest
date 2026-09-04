import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    notificationPreference: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    notification: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/log", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(), appUrl: (p: string) => `https://example.com${p}` }));

import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { runDailyDigest } from "./digest";

describe("runDailyDigest", () => {
  beforeEach(() => vi.resetAllMocks());

  it("collapses N notifications into exactly one email per digest-enabled user", async () => {
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([{ userId: "u1" }] as never);
    vi.mocked(prisma.notification.findMany).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ type: "badge:earned", title: `Badge ${i}`, href: null })) as never
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "u1@example.com", name: "U1" } as never);

    const result = await runDailyDigest();

    expect(result.sent).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendMail).mock.calls[0][0].to).toBe("u1@example.com");
  });

  it("sends nothing for a digest-enabled user with no recent notifications", async () => {
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([{ userId: "u1" }] as never);
    vi.mocked(prisma.notification.findMany).mockResolvedValue([] as never);

    const result = await runDailyDigest();

    expect(result.sent).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does nothing when no user has digest enabled", async () => {
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([] as never);

    const result = await runDailyDigest();

    expect(result.sent).toBe(0);
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });
});
