import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { hasTestDb } from "../setup";
import type { SessionUser } from "@/lib/auth";

/**
 * Phase 6 integration tests (docs/phases/PHASE-06-classroom.md testing plan):
 * roster import/re-import, TA scoping enforced at the API (not just the
 * UI), ROSTER contest enrollment gating, override survival across a
 * rejudge, and semester-rollover cloning. Real Prisma against an ephemeral
 * test DB (skipped without one — tests/setup.ts).
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
    institutionId: "inst-1",
    institutionVerifiedAt: new Date(),
    teacherApprovedAt: null,
    emailVerified: true,
    theme: "dark",
    ...overrides,
  };
}

beforeEach(() => {
  mockSession = null;
});

describe.skipIf(!hasTestDb)("classroom: roster import", () => {
  async function makeSection() {
    const { prisma } = await import("@/lib/db");
    const institution = await prisma.institution.create({
      data: { slug: "diu", name: "Daffodil International University", shortName: "DIU" },
    });
    const teacher = await prisma.user.create({
      data: {
        email: "teacher@diu.edu.bd",
        passwordHash: "x",
        name: "Teacher",
        role: "TEACHER",
        teacherApprovedAt: new Date(),
        institutionId: institution.id,
      },
    });
    const department = await prisma.department.create({
      data: { institutionId: institution.id, name: "Computer Science & Engineering", shortName: "CSE" },
    });
    const course = await prisma.course.create({
      data: { departmentId: department.id, code: "CSE 213", title: "Data Structures" },
    });
    const semester = await prisma.semester.create({
      data: {
        institutionId: institution.id,
        name: "Fall 2026",
        code: "2026F",
        startsAt: new Date("2026-08-01"),
        endsAt: new Date("2026-12-15"),
      },
    });
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, semesterId: semester.id, name: "B", teacherId: teacher.id, inviteCode: "ABCD1234" },
    });
    return { institution, teacher, department, course, semester, section };
  }

  function csvOfNStudents(n: number, invalidCount: number): string {
    const rows = ["Student ID,Name,Email"];
    for (let i = 1; i <= n; i++) {
      if (i <= invalidCount) {
        rows.push(`221-15-${4000 + i},Invalid Row ${i},`); // no email, no valid studentId dupe issues
      } else {
        rows.push(`221-15-${4000 + i},Student ${i},student${i}@diu.edu.bd`);
      }
    }
    return rows.join("\r\n");
  }

  it("imports 60 rows: matched + invited, with invalid rows reported", async () => {
    const { section, institution } = await makeSection();
    const { prisma } = await import("@/lib/db");
    const { parseRoster, applyRoster } = await import("@/lib/roster");

    // Pre-create 40 users who should be "matched" by email.
    for (let i = 1; i <= 40; i++) {
      await prisma.user.create({
        data: {
          email: `student${i}@diu.edu.bd`,
          passwordHash: "x",
          name: `Student ${i}`,
          institutionId: institution.id,
        },
      });
    }

    const csv = csvOfNStudents(60, 2); // 2 invalid (no email), 58 valid rows among which 40 match existing users, 18 invited
    const parsed = parseRoster(Buffer.from(csv, "utf-8"), "roster.csv");
    const { rows, summary } = await applyRoster(section.id, parsed.rows, { mapping: parsed.mapping, dryRun: false });

    expect(rows).toHaveLength(60);
    expect(summary.invalid).toBe(2);
    expect(summary.matched).toBe(40);
    expect(summary.invited).toBe(18);

    const enrollments = await prisma.enrollment.findMany({ where: { sectionId: section.id } });
    expect(enrollments).toHaveLength(58);
  });

  it("re-imports an updated roster idempotently: existing rows untouched, only new ones added", async () => {
    const { section } = await makeSection();
    const { prisma } = await import("@/lib/db");
    const { parseRoster, applyRoster } = await import("@/lib/roster");

    const first = csvOfNStudents(10, 0);
    const parsed1 = parseRoster(Buffer.from(first, "utf-8"), "roster.csv");
    await applyRoster(section.id, parsed1.rows, { mapping: parsed1.mapping, dryRun: false });

    const before = await prisma.enrollment.findMany({ where: { sectionId: section.id } });
    expect(before).toHaveLength(10);

    const second = csvOfNStudents(15, 0); // same 10 + 5 new
    const parsed2 = parseRoster(Buffer.from(second, "utf-8"), "roster.csv");
    const { summary } = await applyRoster(section.id, parsed2.rows, { mapping: parsed2.mapping, dryRun: false });

    expect(summary.duplicate).toBe(10);
    expect(summary.invited + summary.matched).toBe(5);

    const after = await prisma.enrollment.findMany({ where: { sectionId: section.id } });
    expect(after).toHaveLength(15);
  });
});

describe.skipIf(!hasTestDb)("classroom: TA scoping", () => {
  it("a TA can enter a manual mark but cannot publish an assignment or change column weight", async () => {
    const { prisma } = await import("@/lib/db");
    const institution = await prisma.institution.create({ data: { slug: "diu2", name: "DIU", shortName: "DIU" } });
    const teacher = await prisma.user.create({
      data: { email: "t2@diu.edu.bd", passwordHash: "x", name: "Teacher", role: "TEACHER", teacherApprovedAt: new Date(), institutionId: institution.id },
    });
    const taUser = await prisma.user.create({
      data: { email: "ta@diu.edu.bd", passwordHash: "x", name: "TA", role: "STUDENT", institutionId: institution.id },
    });
    const student = await prisma.user.create({
      data: { email: "s1@diu.edu.bd", passwordHash: "x", name: "Student", institutionId: institution.id },
    });
    const department = await prisma.department.create({ data: { institutionId: institution.id, name: "CSE", shortName: "CSE" } });
    const course = await prisma.course.create({ data: { departmentId: department.id, code: "CSE100", title: "Intro" } });
    const semester = await prisma.semester.create({
      data: { institutionId: institution.id, name: "Fall", code: "F26", startsAt: new Date(), endsAt: new Date(Date.now() + 1e10) },
    });
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, semesterId: semester.id, name: "A", teacherId: teacher.id, inviteCode: "TACODE01" },
    });
    await prisma.enrollment.create({ data: { sectionId: section.id, userId: taUser.id, role: "TA", status: "ACTIVE" } });
    await prisma.enrollment.create({ data: { sectionId: section.id, userId: student.id, role: "STUDENT", status: "ACTIVE" } });
    const assignment = await prisma.assignment.create({ data: { sectionId: section.id, title: "HW1" } });
    const column = await prisma.gradebookColumn.create({
      data: { sectionId: section.id, source: "ASSIGNMENT", assignmentId: assignment.id, title: "HW1", weight: 1 },
    });

    mockSession = makeUser({ id: taUser.id, email: taUser.email, role: "STUDENT" });

    // TA CAN enter a manual mark (override).
    const { PUT: overridePut } = await import("@/app/api/teacher/sections/[id]/gradebook/override/route");
    const overrideReq = new NextRequest(`http://localhost/api/teacher/sections/${section.id}/gradebook/override`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ columnId: column.id, userId: student.id, points: 90, reason: "partial credit" }),
    });
    const overrideRes = await overridePut(overrideReq, { params: Promise.resolve({ id: section.id }) });
    expect(overrideRes.status).toBe(200);

    // TA CANNOT publish the assignment.
    const { PATCH: assignmentPatch } = await import("@/app/api/teacher/assignments/[id]/route");
    const publishReq = new NextRequest(`http://localhost/api/teacher/assignments/${assignment.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ published: true }),
    });
    const publishRes = await assignmentPatch(publishReq, { params: Promise.resolve({ id: assignment.id }) });
    expect(publishRes.status).toBe(403);

    // TA CANNOT change the column's weight.
    const { PATCH: columnPatch } = await import("@/app/api/teacher/sections/[id]/gradebook/columns/[cid]/route");
    const weightReq = new NextRequest(`http://localhost/api/teacher/sections/${section.id}/gradebook/columns/${column.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weight: 5 }),
    });
    const weightRes = await columnPatch(weightReq, { params: Promise.resolve({ id: section.id, cid: column.id }) });
    expect(weightRes.status).toBe(403);
  });
});

describe.skipIf(!hasTestDb)("classroom: ROSTER contest gating", () => {
  it("a student not enrolled in the section cannot register for its ROSTER contest", async () => {
    const { prisma } = await import("@/lib/db");
    const { contestCapabilities } = await import("@/lib/contest-access");

    const institution = await prisma.institution.create({ data: { slug: "diu3", name: "DIU", shortName: "DIU" } });
    const teacher = await prisma.user.create({
      data: { email: "t3@diu.edu.bd", passwordHash: "x", name: "Teacher", role: "TEACHER", teacherApprovedAt: new Date(), institutionId: institution.id },
    });
    const department = await prisma.department.create({ data: { institutionId: institution.id, name: "CSE", shortName: "CSE" } });
    const course = await prisma.course.create({ data: { departmentId: department.id, code: "CSE200", title: "Algorithms" } });
    const semester = await prisma.semester.create({
      data: { institutionId: institution.id, name: "Fall", code: "F26b", startsAt: new Date(), endsAt: new Date(Date.now() + 1e10) },
    });
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, semesterId: semester.id, name: "C", teacherId: teacher.id, inviteCode: "ROSTCODE" },
    });
    const outsider = await prisma.user.create({ data: { email: "outsider@x.com", passwordHash: "x", name: "Outsider" } });
    const enrolled = await prisma.user.create({ data: { email: "enrolled@x.com", passwordHash: "x", name: "Enrolled" } });
    await prisma.enrollment.create({ data: { sectionId: section.id, userId: enrolled.id, status: "ACTIVE" } });

    const contest = await prisma.contest.create({
      data: {
        title: "Lab Quiz 1",
        slug: "lab-quiz-1",
        status: "LIVE",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 3_600_000),
        visibility: "PRIVATE",
        joinPolicy: "ROSTER",
        sectionId: section.id,
        createdById: teacher.id,
      },
    });

    const outsiderCaps = await contestCapabilities(makeUser({ id: outsider.id, email: outsider.email }), contest);
    expect(outsiderCaps.has("register")).toBe(false);

    const enrolledCaps = await contestCapabilities(makeUser({ id: enrolled.id, email: enrolled.email }), contest);
    expect(enrolledCaps.has("register")).toBe(true);
  });
});

describe.skipIf(!hasTestDb)("classroom: overrides survive a rejudge", () => {
  it("an override stays fixed after the underlying submission's score changes", async () => {
    const { prisma } = await import("@/lib/db");
    const { computeGradebook } = await import("@/lib/gradebook");

    const institution = await prisma.institution.create({ data: { slug: "diu4", name: "DIU", shortName: "DIU" } });
    const teacher = await prisma.user.create({
      data: { email: "t4@diu.edu.bd", passwordHash: "x", name: "Teacher", role: "TEACHER", teacherApprovedAt: new Date(), institutionId: institution.id },
    });
    const student = await prisma.user.create({ data: { email: "s4@diu.edu.bd", passwordHash: "x", name: "Student", institutionId: institution.id } });
    const department = await prisma.department.create({ data: { institutionId: institution.id, name: "CSE", shortName: "CSE" } });
    const course = await prisma.course.create({ data: { departmentId: department.id, code: "CSE300", title: "OS" } });
    const semester = await prisma.semester.create({
      data: { institutionId: institution.id, name: "Fall", code: "F26c", startsAt: new Date(), endsAt: new Date(Date.now() + 1e10) },
    });
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, semesterId: semester.id, name: "D", teacherId: teacher.id, inviteCode: "REJCODE1" },
    });
    await prisma.enrollment.create({ data: { sectionId: section.id, userId: student.id, status: "ACTIVE" } });

    const problem = await prisma.problem.create({
      data: { slug: "rej-p1", title: "P1", authorId: teacher.id, status: "PUBLISHED", visibility: "PUBLIC" },
    });
    const version = await prisma.problemVersion.create({
      data: { problemId: problem.id, version: 1, statementMd: "x", createdById: teacher.id, maxScore: 100 },
    });
    await prisma.problem.update({ where: { id: problem.id }, data: { currentVersionId: version.id } });

    const assignment = await prisma.assignment.create({ data: { sectionId: section.id, title: "HW" } });
    await prisma.assignmentProblem.create({
      data: { assignmentId: assignment.id, problemId: problem.id, problemVersionId: version.id, points: 100 },
    });
    const column = await prisma.gradebookColumn.create({
      data: { sectionId: section.id, source: "ASSIGNMENT", assignmentId: assignment.id, title: "HW", maxPoints: 100, published: true },
    });

    const submission = await prisma.submission.create({
      data: { userId: student.id, problemId: problem.slug, problemRefId: problem.id, code: "x", verdict: "WA", score: 40, maxScore: 100 },
    });

    let gb = await computeGradebook(section.id);
    expect(gb.students[0].cells[column.id].computed).toBeCloseTo(40);

    await prisma.gradeOverride.create({
      data: { columnId: column.id, userId: student.id, points: 75, reason: "regrade", authorId: teacher.id },
    });

    gb = await computeGradebook(section.id);
    expect(gb.students[0].cells[column.id].final).toBe(75);

    // Simulate a rejudge changing the underlying score.
    await prisma.submission.update({ where: { id: submission.id }, data: { verdict: "AC", score: 100 } });

    gb = await computeGradebook(section.id);
    expect(gb.students[0].cells[column.id].computed).toBeCloseTo(100); // the raw/computed value did change...
    expect(gb.students[0].cells[column.id].final).toBe(75); // ...but the override still wins.
  });
});

describe.skipIf(!hasTestDb)("classroom: semester rollover clone", () => {
  it("clones assignments with shifted dates and an empty roster", async () => {
    const { prisma } = await import("@/lib/db");
    const institution = await prisma.institution.create({ data: { slug: "diu5", name: "DIU", shortName: "DIU" } });
    const teacher = await prisma.user.create({
      data: { email: "t5@diu.edu.bd", passwordHash: "x", name: "Teacher", role: "TEACHER", teacherApprovedAt: new Date(), institutionId: institution.id },
    });
    const student = await prisma.user.create({ data: { email: "s5@diu.edu.bd", passwordHash: "x", name: "Student", institutionId: institution.id } });
    const department = await prisma.department.create({ data: { institutionId: institution.id, name: "CSE", shortName: "CSE" } });
    const course = await prisma.course.create({ data: { departmentId: department.id, code: "CSE400", title: "Networks" } });
    const fall = await prisma.semester.create({
      data: { institutionId: institution.id, name: "Fall 2026", code: "F26d", startsAt: new Date("2026-08-01"), endsAt: new Date("2026-12-15") },
    });
    const spring = await prisma.semester.create({
      data: { institutionId: institution.id, name: "Spring 2027", code: "S27d", startsAt: new Date("2027-01-15"), endsAt: new Date("2027-05-15") },
    });
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, semesterId: fall.id, name: "E", teacherId: teacher.id, inviteCode: "CLONECOD" },
    });
    await prisma.enrollment.create({ data: { sectionId: section.id, userId: student.id, status: "ACTIVE" } });

    const problem = await prisma.problem.create({
      data: { slug: "clone-p1", title: "P1", authorId: teacher.id, status: "PUBLISHED", visibility: "PUBLIC" },
    });
    const version = await prisma.problemVersion.create({
      data: { problemId: problem.id, version: 1, statementMd: "x", createdById: teacher.id, maxScore: 100 },
    });
    await prisma.problem.update({ where: { id: problem.id }, data: { currentVersionId: version.id } });

    const dueAt = new Date("2026-09-15");
    const assignment = await prisma.assignment.create({ data: { sectionId: section.id, title: "HW1", dueAt } });
    await prisma.assignmentProblem.create({
      data: { assignmentId: assignment.id, problemId: problem.id, problemVersionId: version.id, points: 100 },
    });

    mockSession = makeUser({ id: teacher.id, email: teacher.email, role: "TEACHER", teacherApprovedAt: new Date(), institutionId: institution.id });

    const { POST: clonePost } = await import("@/app/api/teacher/sections/[id]/clone/route");
    const req = new NextRequest(`http://localhost/api/teacher/sections/${section.id}/clone`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetSemesterId: spring.id }),
    });
    const res = await clonePost(req, { params: Promise.resolve({ id: section.id }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { section: { id: string } };

    const clonedEnrollments = await prisma.enrollment.findMany({ where: { sectionId: body.section.id } });
    expect(clonedEnrollments).toHaveLength(0);

    const clonedAssignments = await prisma.assignment.findMany({ where: { sectionId: body.section.id } });
    expect(clonedAssignments).toHaveLength(1);
    const shiftMs = spring.startsAt.getTime() - fall.startsAt.getTime();
    expect(clonedAssignments[0].dueAt!.getTime()).toBe(dueAt.getTime() + shiftMs);
  });
});
