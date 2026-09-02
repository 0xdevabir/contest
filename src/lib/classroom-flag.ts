import type { Actor } from "./authz";
import { isEnabled } from "./flags";
import { NotFoundError } from "./errors";

/**
 * Every classroom API route starts with this so the surface 404s cleanly
 * (not a 403 — it shouldn't even look like it exists) when the `classroom`
 * flag is off for this actor.
 */
export async function assertClassroomEnabled(actor: Actor): Promise<void> {
  const on = await isEnabled("classroom", actor ? { userId: actor.id, role: actor.role } : undefined);
  if (!on) throw new NotFoundError();
}
