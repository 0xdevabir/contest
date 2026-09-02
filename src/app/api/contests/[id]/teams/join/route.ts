import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { joinTeam } from "@/lib/teams";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { toResponse, AuthError, RateLimitError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  joinCode: z.string().trim().max(16),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) throw new AuthError();

    const limited = await consume({ bucket: "join:team", identity: session.id }, { tokens: 10, windowSec: 3600 });
    if (!limited.ok) throw new RateLimitError(retryAfterSeconds(limited.resetAt));

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const team = await joinTeam(id, session.id, parsed.data.joinCode);
    return NextResponse.json({ ok: true, team });
  } catch (err) {
    return toResponse(err);
  }
}
