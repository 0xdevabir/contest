import { requireApiKey, v1Data, v1Error } from "@/lib/v1/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const key = await requireApiKey(req, null);
    return v1Data({
      id: key.owner.id,
      email: key.owner.email,
      name: key.owner.name,
      role: key.owner.role,
      scopes: key.scopes,
      rate_limit: key.rateLimit,
    });
  } catch (err) {
    return v1Error(err);
  }
}
