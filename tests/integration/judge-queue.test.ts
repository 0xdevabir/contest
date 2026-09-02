import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { hasTestDb } from "../setup";
import { _resetRateLimitsForTests } from "@/lib/ratelimit";
import { _resetRedisClientForTests } from "@/lib/redis";
import type { Problem } from "@/lib/types";
import type { SessionUser } from "@/lib/auth";

/**
 * End-to-end tests for the Phase 4 async path (docs/phases/
 * DONE__PHASE-04-judge-queue.md), skipped without both a test database and a
 * real Redis (REDIS_URL) — matches the integration tier's conditional-skip
 * pattern. No worker process runs during these tests; the reaper is invoked
 * directly, and the 202 path only asserts the row/job were created, not that
 * a verdict lands (that's worker/src/index.ts's job, exercised manually per
 * worker/README.md).
 */
const hasQueueDeps = hasTestDb && Boolean(process.env.REDIS_URL);

let mockSession: SessionUser | null = null;
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => mockSession),
}));

let mockProblem: Problem;
vi.mock("@/lib/problems", () => ({
  getProblem: vi.fn(() => mockProblem),
  getProblemRef: vi.fn(async () => null),
}));

function baseProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: "p-queue-fixture",
    set: 1,
    question: 1,
    title: "Sum two numbers",
    difficulty: "EASY",
    setTitle: "Fixtures",
    statement: "",
    input: "",
    output: "",
    constraints: "",
    sampleInput: "3 5",
    sampleOutput: "8",
    tests: [{ input: "3 5", output: "8", sample: true }],
    starterCode: "",
    timeLimitMs: 3000,
    memoryLimitMb: 256,
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/judge", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!hasQueueDeps)("judge queue (async path)", () => {
  beforeEach(() => {
    mockSession = null;
    mockProblem = baseProblem();
    _resetRateLimitsForTests();
    _resetRedisClientForTests();
    process.env.FLAGS_JUDGE_QUEUE = "1";
  });

  async function signIn() {
    const { prisma } = await import("@/lib/db");
    const user = await prisma.user.create({
      data: { email: `queue-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x", name: "Queue Test" },
    });
    mockSession = {
      id: user.id,
      email: user.email,
      name: user.name,
      institutionId: null,
      institutionVerifiedAt: null,
      teacherApprovedAt: null,
      role: user.role,
      emailVerified: true,
      theme: "system",
    };
    return user;
  }

  it("returns 202 with a QUEUED submission when the flag is on", async () => {
    await signIn();
    const { POST } = await import("@/app/api/judge/route");
    const res = await POST(postRequest({ problemId: mockProblem.id, code: "int main(){return 0;}", mode: "submit" }));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.state).toBe("QUEUED");
    expect(body.submissionId).toBeTruthy();

    const { prisma } = await import("@/lib/db");
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: body.submissionId } });
    expect(row.state).toBe("QUEUED");
    expect(row.verdict).toBe("PENDING");
  });

  it("reaper requeues a stalled JUDGING submission and completes it on the next attempt", async () => {
    const user = await signIn();
    const { prisma } = await import("@/lib/db");
    const { claimSubmission, reportSubmission } = await import("@/lib/submission-state");
    const { reapStalledSubmissions } = await import("@/lib/queue/reaper");

    const submission = await prisma.submission.create({
      data: {
        userId: user.id,
        problemId: mockProblem.id,
        code: "int main(){return 0;}",
        verdict: "PENDING",
        state: "QUEUED",
        queuedAt: new Date(),
      },
    });
    await claimSubmission(submission.id, "worker-dead");
    // Simulate a heartbeat that went stale 91s ago.
    await prisma.submission.update({
      where: { id: submission.id },
      data: { heartbeatAt: new Date(Date.now() - 91_000) },
    });

    const { requeued } = await reapStalledSubmissions();
    expect(requeued).toBe(1);

    const afterReap = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(afterReap.state).toBe("QUEUED");
    expect(afterReap.claimedBy).toBeNull();

    // A second worker now claims and completes it — attempt 2.
    const claimed = await claimSubmission(submission.id, "worker-b");
    expect(claimed).not.toBeNull();
    expect(claimed!.attempts).toBe(2);
    const reported = await reportSubmission(submission.id, "worker-b", { verdict: "AC", score: 100, maxScore: 100 });
    expect(reported).toBe(true);

    const done = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(done.state).toBe("DONE");
    expect(done.verdict).toBe("AC");
  });

  it("permanently fails a submission once it exceeds max attempts", async () => {
    const user = await signIn();
    const { prisma } = await import("@/lib/db");
    const { claimSubmission } = await import("@/lib/submission-state");
    const { reapStalledSubmissions } = await import("@/lib/queue/reaper");

    const submission = await prisma.submission.create({
      data: {
        userId: user.id,
        problemId: mockProblem.id,
        code: "int main(){return 0;}",
        verdict: "PENDING",
        state: "QUEUED",
        queuedAt: new Date(),
        attempts: 3, // already at the cap — the reap below pushes it to attempt 4 territory
      },
    });
    await claimSubmission(submission.id, "worker-dead");
    await prisma.submission.update({
      where: { id: submission.id },
      data: { heartbeatAt: new Date(Date.now() - 91_000) },
    });

    const { failed } = await reapStalledSubmissions();
    expect(failed).toBe(1);

    const row = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(row.state).toBe("FAILED");
    expect(row.verdict).toBe("IE");
  });
});
