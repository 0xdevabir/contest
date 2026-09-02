import { describe, it, expect } from "vitest";
import { can, assertCan, isApprovedTeacher, type Actor } from "./authz";
import { AuthError, ForbiddenError } from "./errors";

function makeUser(overrides: Partial<NonNullable<Actor>>): Actor {
  return {
    id: "user-1",
    email: "u@x.com",
    name: "User",
    role: "STUDENT",
    institutionId: null,
    institutionVerifiedAt: null,
    teacherApprovedAt: null,
    emailVerified: true,
    theme: "system",
    ...overrides,
  };
}

const admin = makeUser({ id: "admin-1", role: "ADMIN" });
const student = makeUser({ id: "student-1" });
const other = makeUser({ id: "student-2" });
const pendingTeacher = makeUser({ id: "teacher-1", role: "TEACHER", teacherApprovedAt: null });
const approvedTeacher = makeUser({ id: "teacher-2", role: "TEACHER", teacherApprovedAt: new Date() });
const ta = makeUser({ id: "ta-1", role: "TA" });

describe("can", () => {
  it("denies everything for a signed-out actor", () => {
    expect(can(null, "profile:edit")).toBe(false);
    expect(can(null, "contest:register")).toBe(false);
    expect(can(null, "system:admin")).toBe(false);
  });

  it("allows an ADMIN to do everything, including admin-only actions", () => {
    expect(can(admin, "system:admin")).toBe(true);
    expect(can(admin, "contest:delete")).toBe(true);
    expect(can(admin, "user:manage")).toBe(true);
    expect(can(admin, "institution:manage")).toBe(true);
    expect(can(admin, "teacher:approve")).toBe(true);
  });

  it("denies admin-only actions to a plain STUDENT", () => {
    expect(can(student, "contest:create")).toBe(false);
    expect(can(student, "problem:viewHiddenTests")).toBe(false);
    expect(can(student, "submission:rejudge")).toBe(false);
    expect(can(student, "user:manage")).toBe(false);
    expect(can(student, "system:admin")).toBe(false);
    expect(can(student, "institution:manage")).toBe(false);
  });

  it("allows any authenticated actor to register for a contest", () => {
    expect(can(student, "contest:register")).toBe(true);
  });

  it("allows self-service actions on your own resource, denies on someone else's", () => {
    expect(can(student, "profile:edit", { ownerId: student!.id })).toBe(true);
    expect(can(student, "profile:edit", { ownerId: other!.id })).toBe(false);
    expect(can(student, "submission:viewOwn", { ownerId: student!.id })).toBe(true);
    expect(can(student, "submission:viewOwn", { ownerId: other!.id })).toBe(false);
  });

  it("allows a self-service action with no resource ownerId (general case)", () => {
    expect(can(student, "profile:edit")).toBe(true);
  });

  it("denies every teacher-shaped action to an unapproved teacher", () => {
    expect(can(pendingTeacher, "contest:create")).toBe(false);
    expect(can(pendingTeacher, "problem:create")).toBe(false);
    expect(can(pendingTeacher, "contest:edit", { ownerId: pendingTeacher!.id })).toBe(false);
  });

  it("allows contest:create/problem:create to an approved teacher", () => {
    expect(can(approvedTeacher, "contest:create")).toBe(true);
    expect(can(approvedTeacher, "problem:create")).toBe(true);
  });

  it("allows contest:edit to an approved teacher only on their own contest", () => {
    expect(can(approvedTeacher, "contest:edit", { ownerId: approvedTeacher!.id })).toBe(true);
    expect(can(approvedTeacher, "contest:edit", { ownerId: other!.id })).toBe(false);
  });

  it("denies contest:delete even to an approved teacher", () => {
    expect(can(approvedTeacher, "contest:delete")).toBe(false);
  });

  it("allows problem:edit to an approved teacher only on their own problem (Phase 2)", () => {
    expect(can(approvedTeacher, "problem:edit", { ownerId: approvedTeacher!.id })).toBe(true);
    expect(can(approvedTeacher, "problem:edit", { ownerId: other!.id })).toBe(false);
    expect(can(pendingTeacher, "problem:edit", { ownerId: pendingTeacher!.id })).toBe(false);
  });

  it("problem:review is admin-only; problem:submitReview/publish are owner-or-admin", () => {
    expect(can(approvedTeacher, "problem:review")).toBe(false);
    expect(can(admin, "problem:review")).toBe(true);
    expect(can(approvedTeacher, "problem:submitReview", { ownerId: approvedTeacher!.id })).toBe(true);
    expect(can(approvedTeacher, "problem:publish", { ownerId: approvedTeacher!.id })).toBe(true);
    expect(can(approvedTeacher, "problem:publish", { ownerId: other!.id })).toBe(false);
  });

  it("a bare TA role grants nothing on its own", () => {
    expect(can(ta, "contest:create")).toBe(false);
    expect(can(ta, "problem:create")).toBe(false);
    expect(can(ta, "problem:viewHiddenTests")).toBe(false);
  });
});

describe("isApprovedTeacher", () => {
  it("is false for a pending teacher, true for an approved one", () => {
    expect(isApprovedTeacher(pendingTeacher)).toBe(false);
    expect(isApprovedTeacher(approvedTeacher)).toBe(true);
    expect(isApprovedTeacher(student)).toBe(false);
    expect(isApprovedTeacher(null)).toBe(false);
  });
});

describe("assertCan", () => {
  it("throws AuthError for a signed-out actor", () => {
    expect(() => assertCan(null, "profile:edit")).toThrow(AuthError);
  });

  it("throws ForbiddenError when denied", () => {
    expect(() => assertCan(student, "contest:delete")).toThrow(ForbiddenError);
  });

  it("does not throw when allowed", () => {
    expect(() => assertCan(admin, "contest:delete")).not.toThrow();
    expect(() => assertCan(student, "profile:edit", { ownerId: student!.id })).not.toThrow();
  });
});
