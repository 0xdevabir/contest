import type { SessionUser } from "./auth";
import { AuthError, ForbiddenError } from "./errors";

/**
 * The only place a permission decision is made. Phase 0's implementation is
 * deliberately trivial (ADMIN can everything; a handful of self-service
 * actions are allowed on your own resource) — the point of introducing it now
 * is that every route gets the call site installed before there are 60 routes
 * to retrofit. Phase 1 fills in TEACHER/TA and richer ownership rules.
 *
 * "profile:edit" and "contest:register" are Phase 0 additions beyond the
 * original action list: both are self-service actions a route needs to gate,
 * and forcing them through an ill-fitting admin-only action would be wrong.
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
  | "submission:viewAny"
  | "submission:viewOwn"
  | "submission:rejudge"
  | "user:manage"
  | "system:admin"
  | "profile:edit";

export type Actor = SessionUser | null;

/** A resource this action is scoped to, when ownership matters. */
export type Resource = { ownerId?: string } | undefined;

/** Actions only an ADMIN may perform, regardless of ownership. */
const ADMIN_ONLY: ReadonlySet<Action> = new Set([
  "contest:create",
  "contest:edit",
  "contest:delete",
  "problem:create",
  "problem:edit",
  "problem:viewHiddenTests",
  "submission:viewAny",
  "submission:rejudge",
  "user:manage",
  "system:admin",
]);

/** Self-service actions: allowed for any signed-in actor on their own resource. */
const SELF_SERVICE: ReadonlySet<Action> = new Set([
  "profile:edit",
  "submission:viewOwn",
  "contest:viewPrivate",
]);

/** Actions open to any authenticated actor, with no ownership check. */
const AUTHENTICATED_ONLY: ReadonlySet<Action> = new Set(["contest:register"]);

export function can(actor: Actor, action: Action, resource?: Resource): boolean {
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;

  if (AUTHENTICATED_ONLY.has(action)) return true;

  if (SELF_SERVICE.has(action)) {
    // No ownerId on the resource means the action isn't tied to a specific
    // owner (e.g. viewing your own submissions in general) — allowed.
    return !resource?.ownerId || resource.ownerId === actor.id;
  }

  if (ADMIN_ONLY.has(action)) return false;

  return false;
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
