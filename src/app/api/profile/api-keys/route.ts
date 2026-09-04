import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { toResponse, AuthError, ValidationError } from "@/lib/errors";
import { createApiKey, listApiKeys, API_SCOPES } from "@/lib/api-keys";
import { isEnabled } from "@/lib/flags";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    if (!(await isEnabled("platformApi"))) return NextResponse.json({ ok: true, keys: [] });

    const keys = await listApiKeys(session.id);
    return NextResponse.json({
      ok: true,
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        rateLimit: k.rateLimit,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
      })),
    });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    if (!(await isEnabled("platformApi"))) throw new ValidationError("The platform API is not enabled.");

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const { key, rawToken } = await createApiKey(session.id, parsed.data);
    // The raw token is returned exactly once — never retrievable again.
    return NextResponse.json({
      ok: true,
      token: rawToken,
      key: { id: key.id, name: key.name, keyPrefix: key.keyPrefix, scopes: key.scopes, createdAt: key.createdAt },
    });
  } catch (err) {
    return toResponse(err);
  }
}
