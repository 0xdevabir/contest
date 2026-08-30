import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { effectiveContestStatus } from "@/lib/contests";
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

    // Joining before the start whistle is the normal case — the gate is only
    // that the admin has published the contest and it has not finished.
    if (effectiveContestStatus(contest.status, contest.endsAt) !== "LIVE") {
      const ended = contest.status === "LIVE" || contest.status === "ENDED";
      throw new ValidationError(ended ? "This contest has ended" : "This contest is not open yet");
    }

    await prisma.contestRegistration.upsert({
      where: { contestId_userId: { contestId: id, userId: session.id } },
      update: {},
      create: { contestId: id, userId: session.id },
    });

    return NextResponse.json({ ok: true, message: "Registered" });
  } catch (err) {
    return toResponse(err);
  }
}
