import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { recordProctorEvents } from "@/lib/integrity/proctor";
import { toResponse, AuthError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const participation = await prisma.contestParticipation.findUnique({
      where: { contestId_userId_mode: { contestId: id, userId: session.id, mode: "LIVE" } },
      select: { id: true },
    });
    if (!participation) throw new NotFoundError("You are not registered for this contest");

    const count = await recordProctorEvents({
      contestId: id,
      participationId: participation.id,
      userId: session.id,
      events: body.events,
    });

    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return toResponse(err);
  }
}
