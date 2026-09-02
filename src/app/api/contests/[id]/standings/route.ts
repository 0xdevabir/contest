import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { getContestDashboard } from "@/lib/contest-dashboard";
import { toResponse, NotFoundError, ForbiddenError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * docs/phases/PHASE-05-contest-engine.md API contract: live contests recompute
 * on read; a finished contest serves its immutable `"final"` snapshot instead
 * (O(1) — no rescoring an ended contest on every board load).
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    const { id } = await params;
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("viewStandings")) throw new ForbiddenError();

    if (contest.status === "ENDED") {
      const snapshot = await prisma.contestStandingSnapshot.findFirst({
        where: { contestId: id, reason: "final" },
        orderBy: { version: "desc" },
      });
      if (snapshot) {
        return NextResponse.json({ ok: true, source: "snapshot", version: snapshot.version, standings: snapshot.standings });
      }
      // Not finalized by the lifecycle tick yet (e.g. it just ended) — fall
      // through to a live recompute rather than 404ing the board.
    }

    const dashboard = await getContestDashboard(id, {
      viewerId: session?.id ?? null,
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      rules: contest.rules,
      createdAt: contest.createdAt,
    });
    return NextResponse.json({ ok: true, source: "live", standings: dashboard });
  } catch (err) {
    return toResponse(err);
  }
}
