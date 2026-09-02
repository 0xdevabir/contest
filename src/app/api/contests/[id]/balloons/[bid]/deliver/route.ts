import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { toResponse, ForbiddenError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; bid: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id, bid } = await params;
    const session = await getSession();
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("viewAllSubmissions")) throw new ForbiddenError("Staff only");

    const balloon = await prisma.balloon.findUnique({ where: { id: bid } });
    if (!balloon || balloon.contestId !== id) throw new NotFoundError("Balloon not found");

    const updated = await prisma.balloon.update({
      where: { id: bid },
      data: { deliveredAt: new Date(), deliveredById: session!.id },
    });

    return NextResponse.json({ ok: true, balloon: updated });
  } catch (err) {
    return toResponse(err);
  }
}
