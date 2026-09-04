import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { toResponse, AuthError, ValidationError } from "@/lib/errors";
import { revokeApiKey, rotateApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ action: z.enum(["revoke", "rotate"]) });

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    const { id } = await params;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    if (parsed.data.action === "revoke") {
      await revokeApiKey(id, session);
      return NextResponse.json({ ok: true });
    }

    const { key, rawToken } = await rotateApiKey(id, session);
    return NextResponse.json({
      ok: true,
      token: rawToken,
      key: { id: key.id, name: key.name, keyPrefix: key.keyPrefix, scopes: key.scopes, createdAt: key.createdAt },
    });
  } catch (err) {
    return toResponse(err);
  }
}
