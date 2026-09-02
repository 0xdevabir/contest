import type { Actor } from "./authz";
import { isEnabled } from "./flags";
import { NotFoundError } from "./errors";

/**
 * Every ratings/leaderboard API route starts with this so the surface 404s
 * cleanly (not a 403) when the `ratings` flag is off for this actor —
 * mirrors src/lib/classroom-flag.ts and src/lib/analytics-flag.ts.
 */
export async function assertRatingsEnabled(actor: Actor): Promise<void> {
  const on = await isEnabled("ratings", actor ? { userId: actor.id, role: actor.role } : undefined);
  if (!on) throw new NotFoundError();
}
