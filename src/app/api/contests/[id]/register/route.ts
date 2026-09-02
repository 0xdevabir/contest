import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, getCurrentSessionId, bindSessionToContest } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { effectiveContestStatus, parseRules } from "@/lib/contests";
import { contestCapabilities } from "@/lib/contest-access";
import { toResponse, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    // Any authenticated actor may register; email verification is a
    // separate domain rule, checked explicitly below rather than folded
    // into the role-based permission check.
    assertCan(session, "contest:register");

    if (!session.emailVerified) {
      throw new ForbiddenError("Verify your email before joining contests");
    }

    const { id } = await params;
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("register")) {
      throw new ForbiddenError(
        contest.joinPolicy === "ROSTER"
          ? "You are not enrolled in this contest's section"
          : contest.joinPolicy === "OPEN"
            ? "You do not have access to this contest"
            : "This contest requires a join code or password — use the join link instead"
      );
    }

    // Joining before the start whistle is the normal case — the gate is only
    // that the admin has published the contest and it has not finished.
    if (effectiveContestStatus(contest.status, contest.endsAt) !== "LIVE") {
      const ended = contest.status === "LIVE" || contest.status === "ENDED";
      throw new ValidationError(ended ? "This contest has ended" : "This contest is not open yet");
    }

    await prisma.$transaction([
      prisma.contestRegistration.upsert({
        where: { contestId_userId: { contestId: id, userId: session.id } },
        update: {},
        create: { contestId: id, userId: session.id },
      }),
      // Dual-written during the contestV2 soak (docs/phases/PHASE-05-contest-engine.md
      // rollback plan) — ContestParticipation becomes the source of truth once
      // the flag is on, but ContestRegistration keeps working if it's rolled back.
      prisma.contestParticipation.upsert({
        where: { contestId_userId_mode: { contestId: id, userId: session.id, mode: "LIVE" } },
        update: {},
        create: { contestId: id, userId: session.id, mode: "LIVE", official: true },
      }),
    ]);

    if (parseRules(contest.rules).strictMode) {
      const sid = await getCurrentSessionId();
      if (sid) await bindSessionToContest(sid, session.id, id);
    }

    return NextResponse.json({ ok: true, message: "Registered" });
  } catch (err) {
    return toResponse(err);
  }
}
