import { describe, it, expect, beforeEach } from "vitest";
import { hasTestDb } from "../../../tests/setup";

/** D2 — the length floor (nothing meaningful to fingerprint below
 * MIN_TOKEN_COUNT tokens) and upsert idempotency (a rejudge/re-fingerprint
 * replaces, never duplicates). Runs against a real Postgres instance —
 * skipped without one, see tests/setup.ts. */
describe.skipIf(!hasTestDb)("fingerprintSubmission", () => {
  let prisma: typeof import("@/lib/db").prisma;

  beforeEach(async () => {
    ({ prisma } = await import("@/lib/db"));
  });

  async function makeSubmission(code: string) {
    const user = await prisma.user.create({
      data: { email: `fp-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x", name: "Fingerprint Test" },
    });
    return prisma.submission.create({
      data: { userId: user.id, problemId: "p-fixture", code, verdict: "AC" },
    });
  }

  it("never fingerprints a submission below the token floor", async () => {
    const { fingerprintSubmission } = await import("./fingerprint");
    const submission = await makeSubmission("int main(){return 0;}");

    await fingerprintSubmission({
      submissionId: submission.id,
      problemId: "p-fixture",
      code: submission.code,
      language: "c",
    });

    const row = await prisma.submissionFingerprint.findUnique({ where: { submissionId: submission.id } });
    expect(row).toBeNull();
  });

  it("fingerprints a long-enough submission and indexes it", async () => {
    const { fingerprintSubmission } = await import("./fingerprint");
    const code = Array.from(
      { length: 60 },
      (_, i) => `int v${i} = ${i}; v${i} = v${i} + 1; printf("%d", v${i});`
    ).join("\n");
    const submission = await makeSubmission(code);

    await fingerprintSubmission({ submissionId: submission.id, problemId: "p-fixture", code, language: "c" });

    const row = await prisma.submissionFingerprint.findUnique({ where: { submissionId: submission.id } });
    expect(row).not.toBeNull();
    expect(row!.hashes.length).toBeGreaterThan(0);
    expect(row!.tokenCount).toBeGreaterThan(0);

    const indexRows = await prisma.fingerprintIndex.findMany({ where: { submissionId: submission.id } });
    expect(indexRows.length).toBe(row!.hashes.length);
  });

  it("upsert is idempotent — a second call replaces rather than duplicates", async () => {
    const { fingerprintSubmission } = await import("./fingerprint");
    const code = Array.from(
      { length: 60 },
      (_, i) => `int v${i} = ${i}; v${i} = v${i} + 1; printf("%d", v${i});`
    ).join("\n");
    const submission = await makeSubmission(code);
    const opts = { submissionId: submission.id, problemId: "p-fixture", code, language: "c" };

    await fingerprintSubmission(opts);
    await fingerprintSubmission(opts);

    const rows = await prisma.submissionFingerprint.findMany({ where: { submissionId: submission.id } });
    expect(rows).toHaveLength(1);

    const indexRows = await prisma.fingerprintIndex.findMany({ where: { submissionId: submission.id } });
    // No duplicate (hash, submissionId) pairs from the second run.
    const uniqueHashes = new Set(indexRows.map((r) => r.hash));
    expect(indexRows.length).toBe(uniqueHashes.size);
  });
});
