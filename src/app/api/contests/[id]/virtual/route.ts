import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { parseRules, effectiveContestStatus } from "@/lib/contests";
import { contestCapabilities } from "@/lib/contest-access";
import { toResponse, ForbiddenError, NotFoundError, ValidationError, ConflictError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * docs/phases/PHASE-05-contest-engine.md D1 — virtual participation: a
 * personal clock over a past contest, ranked into a shadow copy of the
 * official board. Never rated, never written into the official snapshot
 * (enforced in the scoring engines, not just here).
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "contest:register");

    const { id } = await params;
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("view")) throw new ForbiddenError();

    const rules = parseRules(contest.rules);
    if (!rules.allowVirtual) throw new ValidationError("Virtual participation is disabled for this contest");
    if (effectiveContestStatus(contest.status, contest.endsAt) !== "ENDED") {
      throw new ValidationError("Virtual participation is only available once a contest has ended");
    }

    const existing = await prisma.contestParticipation.findUnique({
      where: { contestId_userId_mode: { contestId: id, userId: session.id, mode: "VIRTUAL" } },
    });
    if (existing) throw new ConflictError("You already have a virtual run — abandon it first");

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + contest.durationMinutes * 60_000);
    const participation = await prisma.contestParticipation.create({
      data: { contestId: id, userId: session.id, mode: "VIRTUAL", official: false, startsAt, endsAt },
    });

    return NextResponse.json({ ok: true, participation });
  } catch (err) {
    return toResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "contest:register");
    const { id } = await params;

    const existing = await prisma.contestParticipation.findUnique({
      where: { contestId_userId_mode: { contestId: id, userId: session.id, mode: "VIRTUAL" } },
    });
    if (!existing) throw new NotFoundError("No virtual run to abandon");

    await prisma.contestParticipation.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
