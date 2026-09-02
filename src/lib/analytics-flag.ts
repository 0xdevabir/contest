import type { Actor } from "./authz";
import { isEnabled } from "./flags";
import { NotFoundError } from "./errors";

/**
 * Every analytics API route starts with this so the surface 404s cleanly
 * (not a 403) when the `analytics` flag is off for this actor — mirrors
 * src/lib/classroom-flag.ts.
 */
export async function assertAnalyticsEnabled(actor: Actor): Promise<void> {
  const on = await isEnabled("analytics", actor ? { userId: actor.id, role: actor.role } : undefined);
  if (!on) throw new NotFoundError();
}
