import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./db", () => ({
  prisma: { certificate: { create: vi.fn(), findUnique: vi.fn() } },
}));

import { prisma } from "./db";
import { canonicalize, issueCertificate, signPayload, verifyCertificate, verifySignature } from "./certificates";

describe("certificate signing", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "a".repeat(32);
    vi.resetAllMocks();
  });

  it("canonicalizes payload key order so signature doesn't depend on insertion order", () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("verifies a signature that matches its payload", () => {
    const payload = { userId: "u1", contestId: "c1", rank: 1 };
    const sig = signPayload(payload);
    expect(verifySignature(payload, sig)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const payload = { userId: "u1", contestId: "c1", rank: 1 };
    const sig = signPayload(payload);
    expect(verifySignature({ ...payload, rank: 2 }, sig)).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifySignature({ a: 1 }, "deadbeef")).toBe(false);
  });
});

describe("issueCertificate / verifyCertificate", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "a".repeat(32);
    vi.resetAllMocks();
  });

  it("issues a certificate with a valid signature", async () => {
    const payload = { userId: "u1", rank: 1 };
    vi.mocked(prisma.certificate.create).mockImplementation((async (args: { data: Record<string, unknown> }) => ({
      id: "cert1",
      revokedAt: null,
      ...args.data,
    })) as never);

    const cert = await issueCertificate({ type: "contest_rank", userId: "u1", payload });
    expect(verifySignature(payload, (cert as { signature: string }).signature)).toBe(true);
  });

  it("returns not_found for a missing certificate", async () => {
    vi.mocked(prisma.certificate.findUnique).mockResolvedValue(null);
    const result = await verifyCertificate("missing");
    expect(result).toEqual({ valid: false, reason: "not_found" });
  });

  it("returns revoked for a revoked certificate", async () => {
    vi.mocked(prisma.certificate.findUnique).mockResolvedValue({
      id: "cert1",
      revokedAt: new Date(),
      payload: { a: 1 },
      signature: signPayload({ a: 1 }),
    } as never);
    const result = await verifyCertificate("cert1");
    expect(result).toEqual({ valid: false, reason: "revoked" });
  });

  it("returns tampered when the stored payload no longer matches its signature", async () => {
    const originalSignature = signPayload({ a: 1 });
    vi.mocked(prisma.certificate.findUnique).mockResolvedValue({
      id: "cert1",
      revokedAt: null,
      payload: { a: 999 },
      signature: originalSignature,
    } as never);
    const result = await verifyCertificate("cert1");
    expect(result).toEqual({ valid: false, reason: "tampered" });
  });

  it("returns valid for an intact certificate", async () => {
    const payload = { a: 1 };
    vi.mocked(prisma.certificate.findUnique).mockResolvedValue({
      id: "cert1",
      revokedAt: null,
      payload,
      signature: signPayload(payload),
    } as never);
    const result = await verifyCertificate("cert1");
    expect(result.valid).toBe(true);
  });
});
