import { describe, it, expect, beforeEach } from "vitest";
import { hasTestDb } from "../../tests/setup";

/**
 * Exercises the D2 state-machine's two safety properties against a real
 * Postgres instance (skipped without one — see tests/setup.ts): claim is
 * atomic under concurrent workers, and report is idempotent under a
 * duplicated call. Both properties come entirely from the conditional
 * `UPDATE ... WHERE state = ...` clauses in src/lib/submission-state.ts —
 * no application-level locking.
 */
describe.skipIf(!hasTestDb)("submission-state", () => {
  let prisma: typeof import("@/lib/db").prisma;

  beforeEach(async () => {
    ({ prisma } = await import("@/lib/db"));
  });

  async function makeQueuedSubmission() {
    const user = await prisma.user.create({
      data: { email: `claim-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x", name: "Claim Test" },
    });
    return prisma.submission.create({
      data: {
        userId: user.id,
        problemId: "p-fixture",
        code: "int main(){return 0;}",
        verdict: "PENDING",
        state: "QUEUED",
        queuedAt: new Date(),
      },
    });
  }

  it("lets exactly one of two concurrent claims win", async () => {
    const { claimSubmission } = await import("./submission-state");
    const submission = await makeQueuedSubmission();

    const [a, b] = await Promise.all([
      claimSubmission(submission.id, "worker-a"),
      claimSubmission(submission.id, "worker-b"),
    ]);

    const winners = [a, b].filter((r) => r !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]!.claimedBy).toMatch(/^worker-[ab]$/);

    const row = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(row.state).toBe("JUDGING");
    expect(row.attempts).toBe(1);
  });

  it("returns null when the row is no longer QUEUED", async () => {
    const { claimSubmission } = await import("./submission-state");
    const submission = await makeQueuedSubmission();
    await claimSubmission(submission.id, "worker-a");

    const second = await claimSubmission(submission.id, "worker-b");
    expect(second).toBeNull();
  });

  it("report is idempotent — replaying it leaves the row unchanged", async () => {
    const { claimSubmission, reportSubmission } = await import("./submission-state");
    const submission = await makeQueuedSubmission();
    await claimSubmission(submission.id, "worker-a");

    const first = await reportSubmission(submission.id, "worker-a", { verdict: "AC", score: 100, maxScore: 100 });
    expect(first).toBe(true);

    const afterFirst = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(afterFirst.state).toBe("DONE");
    expect(afterFirst.verdict).toBe("AC");

    // Replaying the same report (e.g. a retried HMAC call racing the direct
    // path) must be a no-op: the row is no longer JUDGING/claimed by this
    // worker, so the conditional UPDATE matches zero rows.
    const second = await reportSubmission(submission.id, "worker-a", { verdict: "WA", score: 0, maxScore: 100 });
    expect(second).toBe(false);

    const afterSecond = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(afterSecond.verdict).toBe("AC");
  });

  it("rejects a report from a worker that never held the claim", async () => {
    const { claimSubmission, reportSubmission } = await import("./submission-state");
    const submission = await makeQueuedSubmission();
    await claimSubmission(submission.id, "worker-a");

    const applied = await reportSubmission(submission.id, "worker-imposter", { verdict: "AC", score: 100, maxScore: 100 });
    expect(applied).toBe(false);

    const row = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(row.state).toBe("JUDGING");
  });
});
