import { prisma } from "../db";
import type { SessionUser } from "../auth";
import { contestCapabilities } from "../contest-access";
import { assertSectionStaff } from "../section-access";
import { AuthError, NotFoundError, ForbiddenError, ValidationError } from "../errors";

export const INTEGRITY_SCOPE_TYPES = ["contest", "section", "assignment"] as const;
export type IntegrityScopeType = (typeof INTEGRITY_SCOPE_TYPES)[number];

/**
 * Shared auth gate for the teacher integrity console routes: contest scope
 * goes through `contestCapabilities(...).has("edit")` (same bar as editing
 * the contest), section/assignment scope through `assertSectionStaff`
 * (teacher or active TA), resolving the section from the assignment first.
 */
export async function assertIntegrityScopeStaff(
  session: SessionUser | null,
  scopeType: string,
  scopeId: string
): Promise<void> {
  if (!session) throw new AuthError();
  if (!(INTEGRITY_SCOPE_TYPES as readonly string[]).includes(scopeType)) {
    throw new ValidationError("Invalid scope type");
  }

  if (scopeType === "contest") {
    const contest = await prisma.contest.findUnique({ where: { id: scopeId } });
    if (!contest) throw new NotFoundError("Contest not found");
    const caps = await contestCapabilities(session, contest);
    if (!caps.has("edit")) throw new ForbiddenError();
    return;
  }

  if (scopeType === "assignment") {
    const assignment = await prisma.assignment.findUnique({ where: { id: scopeId }, select: { sectionId: true } });
    if (!assignment) throw new NotFoundError("Assignment not found");
    await assertSectionStaff(session, assignment.sectionId);
    return;
  }

  // scopeType === "section"
  await assertSectionStaff(session, scopeId);
}
