import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { hasTestDb } from "../setup";
import { _resetRateLimitsForTests } from "@/lib/ratelimit";
import type { SessionUser } from "@/lib/auth";

/**
 * Phase 7 integration tests (docs/phases/PHASE-07-live-contest.md testing
 * plan): clarification privacy, promote-to-announcement, team registration
 * feeding the merged scoreboard, and the balloon award-on-AC path. Real
 * Prisma against an ephemeral test DB (skipped without one).
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

function req(url: string, body: unknown = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockSession = null;
  _resetRateLimitsForTests();
});

async function makeLiveContest(overrides: { teamSize?: number } = {}) {
  const { prisma } = await import("@/lib/db");
  const owner = await prisma.user.create({
    data: { email: `owner-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x", name: "Owner", role: "TEACHER", teacherApprovedAt: new Date() },
  });
  const contest = await prisma.contest.create({
    data: {
      title: "Live round",
      slug: `live-round-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: "LIVE",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000),
      createdById: owner.id,
      rules: overrides.teamSize ? { rulesVersion: 2, scoring: "icpc", teamSize: overrides.teamSize } : {},
    },
  });
  await prisma.contestStaff.create({ data: { contestId: contest.id, userId: owner.id, role: "OWNER", addedById: owner.id } });
  return { contest, owner };
}

describe.skipIf(!hasTestDb)("clarifications", () => {
  it("a clarification is visible to its asker and to staff, and to nobody else", async () => {
    const { prisma } = await import("@/lib/db");
    const { contest, owner } = await makeLiveContest();
    const asker = await prisma.user.create({ data: { email: "asker@example.com", passwordHash: "x", name: "Asker" } });
    const other = await prisma.user.create({ data: { email: "other@example.com", passwordHash: "x", name: "Other" } });
    await prisma.contestParticipation.create({ data: { contestId: contest.id, userId: asker.id, mode: "LIVE" } });

    const { POST: postClarify, GET: getClarify } = await import("@/app/api/contests/[id]/clarifications/route");

    mockSession = makeUser({ id: asker.id });
    const created = await postClarify(req(`/api/contests/${contest.id}/clarifications`, { question: "Is B's limit really 1s?" }), {
      params: Promise.resolve({ id: contest.id }),
    });
    expect(created.status).toBe(200);

    // The asker sees their own thread.
    const askerView = await getClarify(new NextRequest(`http://localhost/api/contests/${contest.id}/clarifications`), {
      params: Promise.resolve({ id: contest.id }),
    });
    const askerBody = await askerView.json();
    expect(askerBody.clarifications).toHaveLength(1);

    // A different student sees nothing.
    mockSession = makeUser({ id: other.id });
    const otherView = await getClarify(new NextRequest(`http://localhost/api/contests/${contest.id}/clarifications`), {
      params: Promise.resolve({ id: contest.id }),
    });
    const otherBody = await otherView.json();
    expect(otherBody.clarifications).toHaveLength(0);

    // Staff sees it.
    mockSession = makeUser({ id: owner.id, role: "TEACHER" });
    const staffView = await getClarify(new NextRequest(`http://localhost/api/contests/${contest.id}/clarifications`), {
      params: Promise.resolve({ id: contest.id }),
    });
    const staffBody = await staffView.json();
    expect(staffBody.clarifications).toHaveLength(1);
  });

  it("promoting a clarification creates an announcement and marks the thread PROMOTED", async () => {
    const { prisma } = await import("@/lib/db");
    const { contest, owner } = await makeLiveContest();
    const asker = await prisma.user.create({ data: { email: "asker2@example.com", passwordHash: "x", name: "Asker2" } });

    const clarification = await prisma.contestClarification.create({
      data: { contestId: contest.id, userId: asker.id, question: "Are we allowed printf debug output?" },
    });

    mockSession = makeUser({ id: owner.id, role: "TEACHER" });
    const { POST: answer } = await import("@/app/api/contests/[id]/clarifications/[cid]/answer/route");
    const res = await answer(req(`/api/contests/${contest.id}/clarifications/${clarification.id}/answer`, { canned: "no-comment", promote: true }), {
      params: Promise.resolve({ id: contest.id, cid: clarification.id }),
    });
    expect(res.status).toBe(200);

    const updated = await prisma.contestClarification.findUnique({ where: { id: clarification.id } });
    expect(updated?.status).toBe("PROMOTED");
    expect(updated?.answer).toBe("No comment.");

    const announcement = await prisma.contestAnnouncement.findFirst({ where: { sourceClarificationId: clarification.id } });
    expect(announcement).not.toBeNull();
    expect(announcement?.body).toBe("No comment.");
  });

  it("a non-staff user cannot answer a clarification", async () => {
    const { prisma } = await import("@/lib/db");
    const { contest } = await makeLiveContest();
    const asker = await prisma.user.create({ data: { email: "asker3@example.com", passwordHash: "x", name: "Asker3" } });
    const clarification = await prisma.contestClarification.create({
      data: { contestId: contest.id, userId: asker.id, question: "?" },
    });

    mockSession = makeUser({ id: asker.id });
    const { POST: answer } = await import("@/app/api/contests/[id]/clarifications/[cid]/answer/route");
    const res = await answer(req(`/api/contests/${contest.id}/clarifications/${clarification.id}/answer`, { canned: "no-comment" }), {
      params: Promise.resolve({ id: contest.id, cid: clarification.id }),
    });
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!hasTestDb)("teams", () => {
  it("a 3-person team registers, and its members appear as one scoreboard row", async () => {
    const { prisma } = await import("@/lib/db");
    const { contest } = await makeLiveContest({ teamSize: 3 });
    const captain = await prisma.user.create({ data: { email: "captain@example.com", passwordHash: "x", name: "Captain" } });
    const mate = await prisma.user.create({ data: { email: "mate@example.com", passwordHash: "x", name: "Mate" } });

    const { createTeam, joinTeam } = await import("@/lib/teams");
    const team = await createTeam(contest.id, captain.id, "Rocket");
    await joinTeam(contest.id, mate.id, team.joinCode);

    const problem = await prisma.contestProblem.create({
      data: { contestId: contest.id, problemId: "p1", label: "A", points: 100 },
    });
    await prisma.submission.create({
      data: { userId: captain.id, problemId: problem.problemId, contestId: contest.id, code: "x", verdict: "AC", score: 100, maxScore: 100 },
    });

    const { getContestDashboard } = await import("@/lib/contest-dashboard");
    const dashboard = await getContestDashboard(contest.id, {
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      rules: contest.rules,
      createdAt: contest.createdAt,
    });

    // captain + mate collapse into exactly one team row.
    const teamRow = dashboard.rows.find((r) => r.userId === team.id);
    expect(teamRow).toBeTruthy();
    expect(teamRow?.solved).toBe(1);
    expect(dashboard.rows.filter((r) => r.userId === captain.id || r.userId === mate.id)).toHaveLength(0);
  });

  it("a full team refuses another joiner", async () => {
    const { prisma } = await import("@/lib/db");
    const { contest } = await makeLiveContest({ teamSize: 2 });
    const captain = await prisma.user.create({ data: { email: "cap2@example.com", passwordHash: "x", name: "Cap2" } });
    const mate = await prisma.user.create({ data: { email: "mate2@example.com", passwordHash: "x", name: "Mate2" } });
    const extra = await prisma.user.create({ data: { email: "extra@example.com", passwordHash: "x", name: "Extra" } });

    const { createTeam, joinTeam } = await import("@/lib/teams");
    const team = await createTeam(contest.id, captain.id, "Full house");
    await joinTeam(contest.id, mate.id, team.joinCode);

    await expect(joinTeam(contest.id, extra.id, team.joinCode)).rejects.toThrow();
  });
});

describe.skipIf(!hasTestDb)("balloons", () => {
  it("awards exactly one balloon per (participation, problem), even across re-solves", async () => {
    const { prisma } = await import("@/lib/db");
    const { contest } = await makeLiveContest();
    const student = await prisma.user.create({ data: { email: "balloon@example.com", passwordHash: "x", name: "Balloon" } });
    await prisma.contestParticipation.create({ data: { contestId: contest.id, userId: student.id, mode: "LIVE" } });
    await prisma.contestProblem.create({
      data: { contestId: contest.id, problemId: "p1", label: "A", points: 100, balloonColor: "#e11d48" },
    });

    const { awardBalloonIfEligible } = await import("@/lib/balloons");
    await awardBalloonIfEligible({ contestId: contest.id, userId: student.id, problemId: "p1", verdict: "AC" });
    await awardBalloonIfEligible({ contestId: contest.id, userId: student.id, problemId: "p1", verdict: "AC" });

    const balloons = await prisma.balloon.findMany({ where: { contestId: contest.id } });
    expect(balloons).toHaveLength(1);
    expect(balloons[0].color).toBe("#e11d48");
  });

  it("never queues a balloon for a problem with no balloonColor", async () => {
    const { prisma } = await import("@/lib/db");
    const { contest } = await makeLiveContest();
    const student = await prisma.user.create({ data: { email: "noballoon@example.com", passwordHash: "x", name: "NoBalloon" } });
    await prisma.contestParticipation.create({ data: { contestId: contest.id, userId: student.id, mode: "LIVE" } });
    await prisma.contestProblem.create({ data: { contestId: contest.id, problemId: "p1", label: "A", points: 100 } });

    const { awardBalloonIfEligible } = await import("@/lib/balloons");
    await awardBalloonIfEligible({ contestId: contest.id, userId: student.id, problemId: "p1", verdict: "AC" });

    const balloons = await prisma.balloon.findMany({ where: { contestId: contest.id } });
    expect(balloons).toHaveLength(0);
  });
});
