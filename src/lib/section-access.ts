import { prisma } from "./db";
import type { SessionUser } from "./auth";
import { AuthError, ForbiddenError, NotFoundError } from "./errors";

/**
 * Section-scoped membership checks. These live outside src/lib/authz.ts
 * because they need a DB round-trip (Enrollment/CourseSection lookups) —
 * authz.ts's RULES table is deliberately synchronous. A route composes both:
 * `assertCan(session, "gradebook:manageWeights", { ownerId: section.teacherId })`
 * for teacher-only actions, and `assertSectionStaff(session, sectionId)` for
 * anything a TA may also do (D5 — TA permissions are section-scoped and
 * non-destructive).
 */

export async function isSectionTeacher(userId: string, sectionId: string): Promise<boolean> {
  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId },
    select: { teacherId: true },
  });
  return !!section && section.teacherId === userId;
}

export async function isSectionTA(userId: string, sectionId: string): Promise<boolean> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { sectionId, userId, role: "TA", status: "ACTIVE" },
    select: { id: true },
  });
  return !!enrollment;
}

/** Teacher or an active TA of the section — the read/answer/manual-mark surface. */
export async function isSectionStaff(userId: string, sectionId: string): Promise<boolean> {
  if (await isSectionTeacher(userId, sectionId)) return true;
  return isSectionTA(userId, sectionId);
}

export async function isEnrolledStudent(userId: string, sectionId: string): Promise<boolean> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { sectionId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  return !!enrollment;
}

/** Throws unless `actor` is signed in and is the section's teacher (or an admin). */
export async function assertSectionTeacher(
  actor: SessionUser,
  sectionId: string
): Promise<void> {
  if (!actor) throw new AuthError();
  if (actor.role === "ADMIN") return;
  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId },
    select: { id: true, teacherId: true },
  });
  if (!section) throw new NotFoundError("Section not found.");
  if (section.teacherId !== actor.id) throw new ForbiddenError();
}

/** Throws unless `actor` is signed in and is the section's teacher, an active TA, or an admin. */
export async function assertSectionStaff(actor: SessionUser, sectionId: string): Promise<void> {
  if (!actor) throw new AuthError();
  if (actor.role === "ADMIN") return;
  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId },
    select: { id: true, teacherId: true },
  });
  if (!section) throw new NotFoundError("Section not found.");
  if (section.teacherId === actor.id) return;
  if (await isSectionTA(actor.id, sectionId)) return;
  throw new ForbiddenError();
}
