import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  prisma: { courseSection: { findUnique: vi.fn() }, enrollment: { findFirst: vi.fn() } },
}));

import { assertSectionTeacher, assertSectionStaff, isSectionStaff } from "./section-access";
import { prisma } from "./db";
import { AuthError, ForbiddenError, NotFoundError } from "./errors";
import type { SessionUser } from "./auth";

function makeActor(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "teacher-a",
    email: "a@example.com",
    name: "Teacher A",
    role: "TEACHER",
    institutionId: "inst-1",
    institutionVerifiedAt: new Date(),
    teacherApprovedAt: new Date(),
    emailVerified: true,
    theme: "dark",
    ...overrides,
  };
}

/**
 * PHASE-08's testing plan calls out section scoping explicitly: "Teacher A
 * gets 403 on Teacher B's section analytics" and "TA can read analytics for
 * their own section only". Every analytics route funnels through these two
 * assertions, so this is the one place that guarantee needs to hold.
 */
describe("section scoping (analytics/gradebook/classroom routes)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assertSectionTeacher: 403s a teacher who does not own the section", async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValue({ id: "sec-1", teacherId: "teacher-b" } as never);
    const teacherA = makeActor({ id: "teacher-a" });
    await expect(assertSectionTeacher(teacherA, "sec-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("assertSectionTeacher: allows the owning teacher", async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValue({ id: "sec-1", teacherId: "teacher-a" } as never);
    const teacherA = makeActor({ id: "teacher-a" });
    await expect(assertSectionTeacher(teacherA, "sec-1")).resolves.toBeUndefined();
  });

  it("assertSectionTeacher: 401s when signed out, 404s an unknown section", async () => {
    await expect(assertSectionTeacher(null as unknown as SessionUser, "sec-1")).rejects.toBeInstanceOf(AuthError);

    vi.mocked(prisma.courseSection.findUnique).mockResolvedValue(null);
    await expect(assertSectionTeacher(makeActor(), "does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("assertSectionTeacher: admin bypasses ownership entirely", async () => {
    const admin = makeActor({ id: "admin-1", role: "ADMIN" });
    await expect(assertSectionTeacher(admin, "sec-1")).resolves.toBeUndefined();
    expect(prisma.courseSection.findUnique).not.toHaveBeenCalled();
  });

  it("assertSectionStaff: an active TA of the section is allowed, an inactive/other-section TA is not", async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValue({ id: "sec-1", teacherId: "teacher-b" } as never);
    const ta = makeActor({ id: "ta-1", role: "STUDENT" });

    vi.mocked(prisma.enrollment.findFirst).mockResolvedValueOnce({ id: "e1" } as never);
    await expect(assertSectionStaff(ta, "sec-1")).resolves.toBeUndefined();

    vi.mocked(prisma.enrollment.findFirst).mockResolvedValueOnce(null);
    await expect(assertSectionStaff(ta, "sec-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("isSectionStaff: false for a stranger with no teacher/TA relationship to the section", async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValue({ teacherId: "teacher-b" } as never);
    vi.mocked(prisma.enrollment.findFirst).mockResolvedValue(null);
    await expect(isSectionStaff("stranger", "sec-1")).resolves.toBe(false);
  });
});
