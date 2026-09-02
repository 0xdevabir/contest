import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { toResponse, ForbiddenError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * D4 — the post-contest reveal (docs/phases/PHASE-07-live-contest.md).
 * Serves the last `"freeze"` snapshot (what everyone saw during the frozen
 * stretch) and the `"final"` snapshot (the true result) side by side, so the
 * display's resolver mode can animate bottom-up from one to the other
 * without recomputing anything — both are the immutable, versioned
 * snapshots Phase 5 already writes.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("viewStandings")) throw new ForbiddenError();

    const [freeze, final] = await Promise.all([
      prisma.contestStandingSnapshot.findFirst({ where: { contestId: id, reason: "freeze" }, orderBy: { version: "desc" } }),
      prisma.contestStandingSnapshot.findFirst({ where: { contestId: id, reason: "final" }, orderBy: { version: "desc" } }),
    ]);

    return NextResponse.json({
      ok: true,
      freeze: freeze?.standings ?? null,
      final: final?.standings ?? null,
    });
  } catch (err) {
    return toResponse(err);
  }
}
