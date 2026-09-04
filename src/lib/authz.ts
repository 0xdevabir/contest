import type { SessionUser } from "./auth";
import { AuthError, ForbiddenError } from "./errors";

/**
 * The only place a permission decision is made. Every route funnels its
 * checks through `can()` / `assertCan()` — no inline `role === "ADMIN"`
 * checks in routes.
 */
export type Action =
  | "contest:create"
  | "contest:edit"
  | "contest:delete"
  | "contest:viewPrivate"
  | "contest:register"
  | "problem:create"
  | "problem:edit"
  | "problem:viewHiddenTests"
  | "problem:submitReview"
  | "problem:review"
  | "problem:publish"
  | "submission:viewAny"
  | "submission:viewOwn"
  | "submission:rejudge"
  | "user:manage"
  | "system:admin"
  | "profile:edit"
  | "institution:manage"
  | "teacher:approve"
  | "course:manage"
  | "section:manage"
  | "section:viewRoster"
  | "enrollment:manage"
  | "assignment:edit"
  | "assignment:publish"
  | "gradebook:override"
  | "gradebook:manageWeights"
  | "gradebook:export"
  | "gradebook:snapshot"
  | "comment:moderate"
  | "editorial:manage";

export type Actor = SessionUser | null;

/** A resource this action is scoped to, when ownership matters. */
export type Resource = { ownerId?: string } | undefined;

export function isApprovedTeacher(actor: Actor): boolean {
  return !!actor && actor.role === "TEACHER" && actor.teacherApprovedAt != null;
}

/** Lenient: a resource with no ownerId means "not scoped to a specific
 * owner" (e.g. viewing your own submissions in general) — allowed. */
function owns(actor: SessionUser, resource?: Resource): boolean {
  return !resource?.ownerId || resource.ownerId === actor.id;
}

/** Strict: requires an explicit, matching ownerId. A missing resource/ownerId
 * is a denial, not an open door — used for actions with no "my own list"
 * fallback (e.g. viewing hidden tests on a specific problem). */
function ownsStrict(actor: SessionUser, resource?: Resource): boolean {
  return resource?.ownerId != null && resource.ownerId === actor.id;
}

function isAdmin(actor: SessionUser): boolean {
  return actor.role === "ADMIN";
}

/**
 * One rule per action. `actor` is always a signed-in SessionUser here —
 * `can()` handles the signed-out case before consulting this table.
 */
const RULES: Record<Action, (actor: SessionUser, resource?: Resource) => boolean> = {
  "contest:create": (a) => isAdmin(a) || isApprovedTeacher(a),
  "contest:edit": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
  "contest:delete": (a) => isAdmin(a),
  "contest:viewPrivate": (a, r) => owns(a, r),
  "contest:register": () => true,
  "problem:create": (a) => isAdmin(a) || isApprovedTeacher(a),
  "problem:edit": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
  "problem:viewHiddenTests": (a, r) => isAdmin(a) || ownsStrict(a, r),
  "problem:submitReview": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
  "problem:review": (a) => isAdmin(a),
  "problem:publish": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
  "submission:viewAny": (a) => isAdmin(a),
  "submission:viewOwn": (a, r) => owns(a, r),
  "submission:rejudge": (a) => isAdmin(a),
  "user:manage": (a) => isAdmin(a),
  "system:admin": (a) => isAdmin(a),
  "profile:edit": (a, r) => owns(a, r),
  "institution:manage": (a) => isAdmin(a),
  "teacher:approve": (a) => isAdmin(a),
  // Phase 6 — classroom. Section-scoped actions further check TA/teacher
  // membership asynchronously via src/lib/section-access.ts (Enrollment
  // lookups can't live in this synchronous rules table); these entries
  // enforce the coarse role/ownership shape only.
  "course:manage": (a) => isAdmin(a) || isApprovedTeacher(a),
  "section:manage": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
  "section:viewRoster": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && owns(a, r)),
  "enrollment:manage": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
  "assignment:edit": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
  "assignment:publish": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
  "gradebook:override": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && owns(a, r)),
  "gradebook:manageWeights": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
  "gradebook:export": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
  "gradebook:snapshot": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
  // Phase 11 — community.
  "comment:moderate": (a) => isAdmin(a),
  "editorial:manage": (a, r) => isAdmin(a) || (isApprovedTeacher(a) && ownsStrict(a, r)),
};

export function can(actor: Actor, action: Action, resource?: Resource): boolean {
  if (!actor) return false;
  return RULES[action](actor, resource);
}

/**
 * Throws AuthError (401) when signed out, ForbiddenError (403) when denied.
 * The `asserts actor is SessionUser` return type lets callers use `actor`
 * as non-null immediately after this call without a manual `!` assertion.
 */
export function assertCan(
  actor: Actor,
  action: Action,
  resource?: Resource
): asserts actor is SessionUser {
  if (!actor) throw new AuthError();
  if (!can(actor, action, resource)) throw new ForbiddenError();
}
