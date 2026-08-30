import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { hasTestDb } from "../setup";
import { _resetRateLimitsForTests } from "@/lib/ratelimit";
import type { Problem } from "@/lib/types";
import type { SessionUser } from "@/lib/auth";

/**
 * Route-level integration tests. Real Prisma (ephemeral test DB, skipped
 * without one — see tests/setup.ts) and the real local-compiler judge path;
 * only auth/session resolution and the problem bank lookup are mocked, since
 * exercising a signed session cookie and the on-disk problem JSON aren't what
 * these tests are about.
 */

let mockSession: SessionUser | null = null;
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => mockSession),
}));

const HIDDEN_EXPECTED = "999999";
let mockProblem: Problem;
vi.mock("@/lib/problems", () => ({
  getProblem: vi.fn(() => mockProblem),
}));

function baseProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: "p-fixture",
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
    tests: [
      { input: "3 5", output: "8", sample: true },
      { input: "1 1", output: HIDDEN_EXPECTED, sample: false },
    ],
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

const CORRECT_SUM_C = `#include <stdio.h>
int main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);return 0;}`;

const GETENV_PRINTER_C = `#include <stdlib.h>
#include <stdio.h>
int main(){const char* v=getenv("DATABASE_URL");printf("%s", v?v:"");return 0;}`;

beforeEach(() => {
  mockSession = null;
  mockProblem = baseProblem();
  _resetRateLimitsForTests();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_RUNNER_URL", "");
  vi.stubEnv("RUNNER_TOKEN", "");
  vi.stubEnv("JUDGE0_URL", "");
});

describe.skipIf(!hasTestDb)("POST /api/judge", () => {
  it("F-1 regression: an anonymous run cannot read DATABASE_URL from the server env", async () => {
    const { POST } = await import("@/app/api/judge/route");
    const res = await POST(postRequest({ problemId: "p-fixture", code: GETENV_PRINTER_C, mode: "run" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.stdout).toBe("");
  });

  it("F-2: the 11th anonymous run inside the window is rejected with 429 + Retry-After", async () => {
    const { POST } = await import("@/app/api/judge/route");
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await POST(postRequest({ problemId: "p-fixture", code: CORRECT_SUM_C, mode: "run" }));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBeTruthy();
  });

  it("rejects an anonymous submit with 401 (submit always requires an account)", async () => {
    const { POST } = await import("@/app/api/judge/route");
    const res = await POST(postRequest({ problemId: "p-fixture", code: CORRECT_SUM_C, mode: "submit" }));
    expect(res.status).toBe(401);
  });

  it("allows an anonymous run (guests can try samples without an account)", async () => {
    const { POST } = await import("@/app/api/judge/route");
    const res = await POST(postRequest({ problemId: "p-fixture", code: CORRECT_SUM_C, mode: "run" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verdict).toBe("AC");
  });

  it("does not leak hidden-test stdout/expected on a WA against a hidden case", async () => {
    const { prisma } = await import("@/lib/db");
    const user = await prisma.user.create({
      data: {
        email: "hidden-leak@example.com",
        passwordHash: "x",
        name: "Hidden Leak",
        university: "DIU",
        emailVerified: new Date(),
      },
    });
    mockSession = {
      id: user.id,
      email: user.email,
      name: user.name,
      university: user.university,
      role: user.role,
      emailVerified: true,
      theme: "system",
    };

    // Always prints 8 for "3 5" (matches the sample) but never HIDDEN_EXPECTED
    // for the hidden case, so this fails on the hidden test specifically.
    const { POST } = await import("@/app/api/judge/route");
    const res = await POST(postRequest({ problemId: "p-fixture", code: CORRECT_SUM_C, mode: "submit" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.verdict).toBe("WA");
    const hiddenResult = body.results.find((r: { sample?: boolean }) => !r.sample);
    expect(hiddenResult).toBeTruthy();
    expect(hiddenResult.stdout).toBe("");
    expect(hiddenResult.expected).toBeUndefined();
  });

  it("F-4: persists the slowest test's time, not the first test's time", async () => {
    const { prisma } = await import("@/lib/db");
    const user = await prisma.user.create({
      data: {
        email: "f4@example.com",
        passwordHash: "x",
        name: "F4",
        university: "DIU",
        emailVerified: new Date(),
      },
    });
    mockSession = {
      id: user.id,
      email: user.email,
      name: user.name,
      university: user.university,
      role: user.role,
      emailVerified: true,
      theme: "system",
    };
    mockProblem = baseProblem({
      tests: [
        { input: "3 5", output: "8", sample: true },
        { input: "1 1", output: "2", sample: true },
      ],
    });

    const { POST } = await import("@/app/api/judge/route");
    const res = await POST(postRequest({ problemId: "p-fixture", code: CORRECT_SUM_C, mode: "submit" }));
    expect(res.status).toBe(200);

    const saved = await prisma.submission.findFirst({
      where: { userId: user.id, problemId: "p-fixture" },
      orderBy: { createdAt: "desc" },
    });
    expect(saved).toBeTruthy();
    expect(saved!.verdict).toBe("AC");
    expect(saved!.report).toBeTruthy();
  });

  it("rejects a submission to a contest the user has not registered for", async () => {
    const { prisma } = await import("@/lib/db");
    const admin = await prisma.user.create({
      data: {
        email: "admin-contest@example.com",
        passwordHash: "x",
        name: "Admin",
        university: "DIU",
        role: "ADMIN",
        emailVerified: new Date(),
      },
    });
    const student = await prisma.user.create({
      data: {
        email: "unregistered@example.com",
        passwordHash: "x",
        name: "Student",
        university: "DIU",
        emailVerified: new Date(),
      },
    });
    const contest = await prisma.contest.create({
      data: {
        slug: "gate-test",
        title: "Gate Test",
        status: "LIVE",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        createdById: admin.id,
        problems: { create: [{ problemId: "p-fixture", label: "A", points: 100 }] },
      },
    });
    mockSession = {
      id: student.id,
      email: student.email,
      name: student.name,
      university: student.university,
      role: student.role,
      emailVerified: true,
      theme: "system",
    };

    const { POST } = await import("@/app/api/judge/route");
    const res = await POST(
      postRequest({ problemId: "p-fixture", code: CORRECT_SUM_C, mode: "submit", contestId: contest.id })
    );
    expect(res.status).toBe(403);
  });
});
