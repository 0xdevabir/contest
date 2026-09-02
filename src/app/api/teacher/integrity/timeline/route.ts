import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { buildTimeline } from "@/lib/integrity/proctor";
import { contestCapabilities } from "@/lib/contest-access";
import { toResponse, ValidationError, NotFoundError, ForbiddenError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const { searchParams } = new URL(req.url);
    let participationId = searchParams.get("participationId") ?? "";
    const contestId = searchParams.get("contestId") ?? "";
    const userId = searchParams.get("userId") ?? "";
    if (!participationId && !(contestId && userId)) {
      throw new ValidationError("participationId, or contestId + userId, is required");
    }

    // The integrity console's pair rows only know a userId, not a
    // participationId — resolve it the same way the pair itself was
    // generated (LIVE participation for that contest).
    if (!participationId) {
      const resolved = await prisma.contestParticipation.findUnique({
        where: { contestId_userId_mode: { contestId, userId, mode: "LIVE" } },
        select: { id: true },
      });
      if (!resolved) throw new NotFoundError("Participation not found");
      participationId = resolved.id;
    }

    const participation = await prisma.contestParticipation.findUnique({
      where: { id: participationId },
      select: { contest: true },
    });
    if (!participation) throw new NotFoundError("Participation not found");

    const caps = await contestCapabilities(session, participation.contest);
    if (!caps.has("edit")) throw new ForbiddenError();

    const timeline = await buildTimeline(participationId);
    return NextResponse.json({ ok: true, timeline });
  } catch (err) {
    return toResponse(err);
  }
}
