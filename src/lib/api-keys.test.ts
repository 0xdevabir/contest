import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

vi.mock("./db", () => ({
  prisma: {
    apiKey: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

const baseUser = {
  id: "u1",
  email: "a@b.com",
  name: "Alice",
  role: "TEACHER",
  status: "ACTIVE",
  institutionId: null,
  institutionVerifiedAt: null,
  teacherApprovedAt: new Date(),
  emailVerified: new Date(),
};

describe("createApiKey", () => {
  beforeEach(() => vi.resetAllMocks());

  it("hashes the token with SHA-256 and stores only the hash + a display prefix", async () => {
    const { createApiKey } = await import("./api-keys");
    const { prisma } = await import("./db");
    vi.mocked(prisma.apiKey.create).mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "k1",
        ...args.data,
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
      })) as unknown as typeof prisma.apiKey.create);

    const { rawToken } = await createApiKey("u1", { name: "CI", scopes: ["problems:read"] });

    expect(rawToken).toMatch(/^chk_(live|test)_/);
    const createCall = vi.mocked(prisma.apiKey.create).mock.calls[0][0] as { data: { keyHash: string; keyPrefix: string } };
    expect(createCall.data.keyHash).toBe(createHash("sha256").update(rawToken).digest("hex"));
    expect(rawToken.startsWith(createCall.data.keyPrefix)).toBe(true);
    expect(createCall.data.keyHash).not.toBe(rawToken);
  });

  it("rejects an unknown scope", async () => {
    const { createApiKey } = await import("./api-keys");
    await expect(createApiKey("u1", { name: "x", scopes: ["not:a:scope"] })).rejects.toThrow();
  });
});

describe("authenticateApiKey", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects a revoked key", async () => {
    const { authenticateApiKey } = await import("./api-keys");
    const { prisma } = await import("./db");
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      id: "k1",
      userId: "u1",
      scopes: ["problems:read"],
      rateLimit: 60,
      revokedAt: new Date(),
      expiresAt: null,
      user: baseUser,
    } as never);

    await expect(authenticateApiKey("chk_test_abc")).rejects.toThrow(/revoked/i);
  });

  it("rejects an expired key", async () => {
    const { authenticateApiKey } = await import("./api-keys");
    const { prisma } = await import("./db");
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      id: "k1",
      userId: "u1",
      scopes: ["problems:read"],
      rateLimit: 60,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      user: baseUser,
    } as never);

    await expect(authenticateApiKey("chk_test_abc")).rejects.toThrow(/expired/i);
  });

  it("rejects a token that doesn't look like an API key without a DB round trip", async () => {
    const { authenticateApiKey } = await import("./api-keys");
    const { prisma } = await import("./db");
    await expect(authenticateApiKey("not-a-key")).rejects.toThrow();
    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
  });
});

describe("requireScope", () => {
  it("throws when the key lacks the required scope", async () => {
    const { requireScope } = await import("./api-keys");
    const key = { id: "k1", userId: "u1", scopes: ["problems:read"] as const, rateLimit: 60, owner: baseUser } as never;
    expect(() => requireScope(key, "problems:write")).toThrow();
  });

  it("passes when the key has the required scope", async () => {
    const { requireScope } = await import("./api-keys");
    const key = { id: "k1", userId: "u1", scopes: ["problems:read"] as const, rateLimit: 60, owner: baseUser } as never;
    expect(() => requireScope(key, "problems:read")).not.toThrow();
  });
});
