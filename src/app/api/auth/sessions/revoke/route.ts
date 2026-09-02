import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, getCurrentSessionId, revokeSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, AuthError, ValidationError, NotFoundError, ForbiddenError } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({ sessionId: z.string().trim().optional() });

/** Omit `sessionId` to sign out every other device, keeping this one. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      /* empty body is fine — means "revoke all others" */
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid request");

    if (parsed.data.sessionId) {
      const target = await prisma.session.findUnique({ where: { id: parsed.data.sessionId } });
      if (!target) throw new NotFoundError("Session not found");
      if (target.userId !== session.id) throw new ForbiddenError();
      await revokeSession(target.id, "user-revoked");
      return NextResponse.json({ ok: true });
    }

    const currentSid = await getCurrentSessionId();
    const others = await prisma.session.findMany({
      where: { userId: session.id, revokedAt: null, id: { not: currentSid ?? undefined } },
      select: { id: true },
    });
    for (const s of others) {
      await revokeSession(s.id, "user-revoked-all-others");
    }

    return NextResponse.json({ ok: true, revoked: others.length });
  } catch (err) {
    return toResponse(err);
  }
}
