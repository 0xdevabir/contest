import { requireApiKey, v1Data, v1Error } from "@/lib/v1/http";
import { getPublicProfile } from "@/lib/profile";
import { NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ handle: string }> };

/**
 * GET /api/v1/users/{handle} — `{handle}` is the user id (this app has no
 * separate handle field; `/u/[id]` uses the same convention). Only fields
 * the profile's own privacy settings already expose to a stranger — the API
 * must never become a way around `profilePublic` (D2).
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const key = await requireApiKey(req, "users:read");
    const { handle } = await params;

    const profile = await getPublicProfile(handle, key.owner.id);
    if (!profile) throw new NotFoundError("User not found");

    return v1Data(profile);
  } catch (err) {
    return v1Error(err);
  }
}
