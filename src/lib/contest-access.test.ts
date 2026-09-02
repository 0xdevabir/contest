import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ContestRole, ContestVisibility, ContestJoinPolicy } from "@prisma/client";

vi.mock("./db", () => ({
  prisma: { contestStaff: { findUnique: vi.fn() }, enrollment: { findFirst: vi.fn() } },
}));

import {
  contestCapabilities,
  contestProblemHref,
  contestSubmissionError,
  generateJoinCode,
  type ContestForAccess,
} from "./contest-access";
import { prisma } from "./db";
import type { Actor } from "./authz";

const CONTEST: ContestForAccess = {
  id: "c1",
  status: "LIVE",
  startsAt: new Date(),
  endsAt: new Date(Date.now() + 3_600_000),
  visibility: "PUBLIC",
  joinPolicy: "OPEN",
  institutionId: "inst-a",
  createdById: "owner-1",
  sectionId: null,
};

function makeActor(overrides: Partial<NonNullable<Actor>> = {}): Actor {
  return {
    id: "u1",
    email: "u1@example.com",
    name: "Student",
    role: "STUDENT",
    institutionId: "inst-a",
    institutionVerifiedAt: new Date(),
    teacherApprovedAt: null,
    emailVerified: true,
    theme: "dark",
    ...overrides,
  };
}

function mockStaffRole(role: ContestRole | null) {
  vi.mocked(prisma.contestStaff.findUnique).mockResolvedValue(
    (role ? { role } : null) as never
  );
}

describe("contestCapabilities", () => {
  beforeEach(() => vi.clearAllMocks());

  const VISIBILITIES: ContestVisibility[] = ["PUBLIC", "UNLISTED", "INSTITUTION", "PRIVATE"];
  const JOIN_POLICIES: ContestJoinPolicy[] = ["OPEN", "CODE", "PASSWORD", "ROSTER", "INVITE", "STAFF_ONLY"];

  it("signed-out actors can view PUBLIC/UNLISTED but never INSTITUTION or PRIVATE, and never register", async () => {
    mockStaffRole(null);
    for (const visibility of VISIBILITIES) {
      const caps = await contestCapabilities(null, { ...CONTEST, visibility });
      const expectedView = visibility === "PUBLIC" || visibility === "UNLISTED";
      expect(caps.has("view")).toBe(expectedView);
      expect(caps.has("register")).toBe(false);
    }
  });

  it("a stranger from a different institution sees PUBLIC/UNLISTED but not INSTITUTION or PRIVATE", async () => {
    mockStaffRole(null);
    const stranger = makeActor({ institutionId: "inst-b" });
    expect((await contestCapabilities(stranger, { ...CONTEST, visibility: "PUBLIC" })).has("view")).toBe(true);
    expect((await contestCapabilities(stranger, { ...CONTEST, visibility: "UNLISTED" })).has("view")).toBe(true);
    expect((await contestCapabilities(stranger, { ...CONTEST, visibility: "INSTITUTION" })).has("view")).toBe(false);
    expect((await contestCapabilities(stranger, { ...CONTEST, visibility: "PRIVATE" })).has("view")).toBe(false);
  });

  it("a same-institution student can view an INSTITUTION contest but not PRIVATE", async () => {
    mockStaffRole(null);
    const member = makeActor({ institutionId: "inst-a" });
    expect((await contestCapabilities(member, { ...CONTEST, visibility: "INSTITUTION" })).has("view")).toBe(true);
    expect((await contestCapabilities(member, { ...CONTEST, visibility: "PRIVATE" })).has("view")).toBe(false);
  });

  it("an admin sees and can manage everything regardless of visibility or staff role", async () => {
    mockStaffRole(null);
    const admin = makeActor({ role: "ADMIN" });
    for (const visibility of VISIBILITIES) {
      const caps = await contestCapabilities(admin, { ...CONTEST, visibility });
      expect(caps.has("view")).toBe(true);
      expect(caps.has("edit")).toBe(true);
      expect(caps.has("manageStaff")).toBe(true);
      expect(caps.has("rejudge")).toBe(true);
      expect(caps.has("viewAllSubmissions")).toBe(true);
    }
  });

  it("existing participants can always see a PRIVATE contest even without a staff role", async () => {
    mockStaffRole(null);
    const student = makeActor({ institutionId: "inst-b" });
    const caps = await contestCapabilities(student, { ...CONTEST, visibility: "PRIVATE" }, { mode: "LIVE", official: true });
    expect(caps.has("view")).toBe(true);
    expect(caps.has("submit")).toBe(true);
    expect(caps.has("edit")).toBe(false);
  });

  it("staff role determines edit/manageStaff/rejudge independently of visibility", async () => {
    const actor = makeActor();

    mockStaffRole("OBSERVER");
    let caps = await contestCapabilities(actor, CONTEST);
    expect(caps.has("view")).toBe(true);
    expect(caps.has("viewAllSubmissions")).toBe(true);
    expect(caps.has("edit")).toBe(false);
    expect(caps.has("manageStaff")).toBe(false);
    expect(caps.has("rejudge")).toBe(false);

    mockStaffRole("JUDGE");
    caps = await contestCapabilities(actor, CONTEST);
    expect(caps.has("rejudge")).toBe(true);
    expect(caps.has("edit")).toBe(false);

    mockStaffRole("COAUTHOR");
    caps = await contestCapabilities(actor, CONTEST);
    expect(caps.has("edit")).toBe(true);
    expect(caps.has("manageStaff")).toBe(false);

    mockStaffRole("OWNER");
    caps = await contestCapabilities(actor, CONTEST);
    expect(caps.has("edit")).toBe(true);
    expect(caps.has("manageStaff")).toBe(true);
    expect(caps.has("rejudge")).toBe(true);
  });

  it("only OPEN grants self-service register when there's no section to check (full matrix)", async () => {
    mockStaffRole(null);
    vi.mocked(prisma.enrollment.findFirst).mockResolvedValue(null);
    const member = makeActor({ institutionId: "inst-a" });
    for (const visibility of ["PUBLIC", "UNLISTED", "INSTITUTION"] as ContestVisibility[]) {
      for (const joinPolicy of JOIN_POLICIES) {
        const caps = await contestCapabilities(member, { ...CONTEST, visibility, joinPolicy });
        const expected = joinPolicy === "OPEN";
        expect(caps.has("register")).toBe(expected);
      }
    }
  });

  it("ROSTER grants register only for an actor enrolled in the contest's section", async () => {
    mockStaffRole(null);
    const member = makeActor({ institutionId: "inst-a" });
    const rosterContest = { ...CONTEST, joinPolicy: "ROSTER" as ContestJoinPolicy, sectionId: "sec-1" };

    vi.mocked(prisma.enrollment.findFirst).mockResolvedValueOnce(null);
    let caps = await contestCapabilities(member, rosterContest);
    expect(caps.has("register")).toBe(false);

    vi.mocked(prisma.enrollment.findFirst).mockResolvedValueOnce({ id: "e1" } as never);
    caps = await contestCapabilities(member, rosterContest);
    expect(caps.has("register")).toBe(true);
  });
});

describe("generateJoinCode", () => {
  it("is 8 characters from the unambiguous alphabet", () => {
    const code = generateJoinCode();
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[0O1lI]/);
  });
});

describe("contestProblemHref", () => {
  it("opens a live problem in contest mode for a joined contestant", () => {
    expect(
      contestProblemHref({ phase: "RUNNING", registered: true, contestId: "contest-1", problemId: "problem-a" })
    ).toBe("/problems/problem-a?contest=contest-1");
  });
  it("blocks an unregistered contestant from a live problem", () => {
    expect(
      contestProblemHref({ phase: "RUNNING", registered: false, contestId: "contest-1", problemId: "problem-a" })
    ).toBeNull();
  });
});

describe("contestSubmissionError", () => {
  it("allows a joined user to submit a listed problem during a live contest", () => {
    expect(
      contestSubmissionError({ contestOpen: true, contestEnded: false, problemIncluded: true, registered: true })
    ).toBeNull();
  });
});
