import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createTeam, getMyTeam } from "@/lib/teams";
import { toResponse, AuthError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
});

/** D3 — creates a team and returns its join code (docs/phases/PHASE-07-live-contest.md). */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) throw new AuthError();

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const team = await createTeam(id, session.id, parsed.data.name);
    return NextResponse.json({ ok: true, team });
  } catch (err) {
    return toResponse(err);
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) throw new AuthError();

    const team = await getMyTeam(id, session.id);
    return NextResponse.json({ ok: true, team });
  } catch (err) {
    return toResponse(err);
  }
}
