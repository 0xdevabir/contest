import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { hasTestDb } from "../setup";
import { _resetRateLimitsForTests } from "@/lib/ratelimit";
import type { SessionUser } from "@/lib/auth";

/**
 * Phase 5 integration tests (docs/phases/PHASE-05-contest-engine.md testing
 * plan): visibility enforcement at the DB/route level, the join-code rate
 * limit, and snapshot versioning. Real Prisma against an ephemeral test DB
 * (skipped without one — tests/setup.ts); only session resolution is mocked.
 */

let mockSession: SessionUser | null = null;
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => mockSession),
}));

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "u1",
    email: "u1@example.com",
    name: "Test User",
    role: "STUDENT",
    institutionId: null,
    institutionVerifiedAt: null,
    teacherApprovedAt: null,
    emailVerified: true,
    theme: "dark",
    ...overrides,
  };
}

function postReq(url: string, body: unknown = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockSession = null;
  _resetRateLimitsForTests();
});

describe.skipIf(!hasTestDb)("contest visibility", () => {
  it("a PRIVATE+ROSTER contest is invisible in /api/contests and unreachable by direct fetch for a stranger", async () => {
    const { prisma } = await import("@/lib/db");
    const owner = await prisma.user.create({
      data: { email: "owner@example.com", passwordHash: "x", name: "Owner", role: "TEACHER", teacherApprovedAt: new Date() },
    });
    const contest = await prisma.contest.create({
      data: {
        title: "Section 3 quiz",
        slug: "section-3-quiz",
        status: "LIVE",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 3_600_000),
        visibility: "PRIVATE",
        joinPolicy: "ROSTER",
        createdById: owner.id,
      },
    });

    const { contestListWhere, contestCapabilities } = await import("@/lib/contest-access");
    const stranger = makeUser({ id: "stranger" });

    const listed = await prisma.contest.findMany({ where: { AND: [{ id: contest.id }, contestListWhere(stranger)] } });
    expect(listed).toHaveLength(0);

    const caps = await contestCapabilities(stranger, contest);
    expect(caps.has("view")).toBe(false);
  });

  it("staff can still see and manage a PRIVATE contest", async () => {
    const { prisma } = await import("@/lib/db");
    const owner = await prisma.user.create({
      data: { email: "owner2@example.com", passwordHash: "x", name: "Owner2", role: "TEACHER", teacherApprovedAt: new Date() },
    });
    const contest = await prisma.contest.create({
      data: { title: "Private drill", slug: "private-drill", visibility: "PRIVATE", joinPolicy: "STAFF_ONLY", createdById: owner.id },
    });
    await prisma.contestStaff.create({ data: { contestId: contest.id, userId: owner.id, role: "OWNER", addedById: owner.id } });

    const { contestCapabilities } = await import("@/lib/contest-access");
    const ownerActor = makeUser({ id: owner.id, role: "TEACHER" });
    const caps = await contestCapabilities(ownerActor, contest);
    expect(caps.has("view")).toBe(true);
    expect(caps.has("edit")).toBe(true);
  });
});

describe.skipIf(!hasTestDb)("join flow", () => {
  async function makeCodeContest(joinPolicy: "CODE" | "PASSWORD" = "CODE") {
    const { prisma } = await import("@/lib/db");
    const { hashPassword } = await import("@/lib/password");
    const owner = await prisma.user.create({
      data: { email: `owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner", role: "TEACHER", teacherApprovedAt: new Date() },
    });
    const contest = await prisma.contest.create({
      data: {
        title: "Code-gated round",
        slug: `code-round-${Date.now()}`,
        status: "LIVE",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 3_600_000),
        visibility: "PUBLIC",
        joinPolicy,
        joinCode: "AB3D9FQK",
        joinPasswordHash: joinPolicy === "PASSWORD" ? await hashPassword("hunter2") : null,
        createdById: owner.id,
      },
    });
    return contest;
  }

  it("rejects a wrong join code with 403", async () => {
    const contest = await makeCodeContest("CODE");
    mockSession = makeUser({ id: "joiner1" });
    const { prisma } = await import("@/lib/db");
    await prisma.user.create({ data: { id: "joiner1", email: "joiner1@example.com", passwordHash: "x", name: "Joiner" } });

    const { POST } = await import("@/app/api/contests/[id]/join/route");
    const res = await POST(postReq(`/api/contests/${contest.id}/join`, { code: "WRONGCODE" }), {
      params: Promise.resolve({ id: contest.id }),
    });
    expect(res.status).toBe(403);
  });

  it("accepts the right code and password", async () => {
    const contest = await makeCodeContest("PASSWORD");
    mockSession = makeUser({ id: "joiner2" });
    const { prisma } = await import("@/lib/db");
    await prisma.user.create({ data: { id: "joiner2", email: "joiner2@example.com", passwordHash: "x", name: "Joiner2" } });

    const { POST } = await import("@/app/api/contests/[id]/join/route");
    const res = await POST(postReq(`/api/contests/${contest.id}/join`, { code: "AB3D9FQK", password: "hunter2" }), {
      params: Promise.resolve({ id: contest.id }),
    });
    expect(res.status).toBe(200);

    const participation = await prisma.contestParticipation.findUnique({
      where: { contestId_userId_mode: { contestId: contest.id, userId: "joiner2", mode: "LIVE" } },
    });
    expect(participation).not.toBeNull();
  });

  it("rate-limits after 10 wrong attempts in an hour", async () => {
    const contest = await makeCodeContest("CODE");
    mockSession = makeUser({ id: "joiner3" });
    const { prisma } = await import("@/lib/db");
    await prisma.user.create({ data: { id: "joiner3", email: "joiner3@example.com", passwordHash: "x", name: "Joiner3" } });

    const { POST } = await import("@/app/api/contests/[id]/join/route");
    let last;
    for (let i = 0; i < 11; i++) {
      last = await POST(postReq(`/api/contests/${contest.id}/join`, { code: "WRONG" }), {
        params: Promise.resolve({ id: contest.id }),
      });
    }
    expect(last!.status).toBe(429);
  });
});

describe.skipIf(!hasTestDb)("standings snapshots", () => {
  it("a rejudge on a finished contest creates version 2 and leaves version 1 intact", async () => {
    const { prisma } = await import("@/lib/db");
    const { snapshotContest } = await import("@/lib/contest-lifecycle");
    const owner = await prisma.user.create({
      data: { email: "owner3@example.com", passwordHash: "x", name: "Owner3", role: "TEACHER", teacherApprovedAt: new Date() },
    });
    const contest = await prisma.contest.create({
      data: {
        title: "Finished round",
        slug: `finished-${Date.now()}`,
        status: "ENDED",
        startsAt: new Date(Date.now() - 7_200_000),
        endsAt: new Date(Date.now() - 3_600_000),
        createdById: owner.id,
      },
    });

    await snapshotContest(contest.id, "final");
    await snapshotContest(contest.id, "rejudge");

    const snapshots = await prisma.contestStandingSnapshot.findMany({
      where: { contestId: contest.id },
      orderBy: { version: "asc" },
    });
    expect(snapshots.map((s) => s.version)).toEqual([1, 2]);
    expect(snapshots[0].reason).toBe("final");
    expect(snapshots[1].reason).toBe("rejudge");
  });
});
