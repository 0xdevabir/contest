import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { effectiveContestStatus } from "@/lib/contests";
import { verifyPassword } from "@/lib/password";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { toResponse, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";
import { isEnrolledStudent } from "@/lib/section-access";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  code: z.string().trim().max(16).optional(),
  password: z.string().max(200).optional(),
});

/**
 * docs/phases/PHASE-05-contest-engine.md — join flow for CODE/PASSWORD
 * contests. Rate-limited per user (10/hour) so a 4-character-equivalent code
 * can't be brute-forced from a signed-in account.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "contest:register");
    if (!session.emailVerified) {
      throw new ForbiddenError("Verify your email before joining contests");
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid data");

    const limited = await consume({ bucket: "join:contest", identity: session.id }, { tokens: 10, windowSec: 3600 });
    if (!limited.ok) throw new RateLimitError(retryAfterSeconds(limited.resetAt));

    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    if (effectiveContestStatus(contest.status, contest.endsAt) !== "LIVE") {
      throw new ValidationError(
        contest.status === "ENDED" ? "This contest has ended" : "This contest is not open yet"
      );
    }

    if (contest.joinPolicy === "CODE" || contest.joinPolicy === "PASSWORD") {
      if (!contest.joinCode || parsed.data.code?.toUpperCase() !== contest.joinCode) {
        throw new ForbiddenError("Incorrect join code");
      }
    }
    if (contest.joinPolicy === "PASSWORD") {
      const ok = contest.joinPasswordHash && parsed.data.password
        ? await verifyPassword(parsed.data.password, contest.joinPasswordHash)
        : false;
      if (!ok) throw new ForbiddenError("Incorrect password");
    }
    if (contest.joinPolicy === "STAFF_ONLY") {
      throw new ForbiddenError("This contest does not accept participants");
    }
    if (contest.joinPolicy === "INVITE") {
      throw new ForbiddenError("This contest requires an invitation");
    }
    if (contest.joinPolicy === "ROSTER") {
      const enrolled = contest.sectionId && (await isEnrolledStudent(session.id, contest.sectionId));
      if (!enrolled) throw new ForbiddenError("You are not enrolled in this contest's section");
    }

    await prisma.$transaction([
      prisma.contestRegistration.upsert({
        where: { contestId_userId: { contestId: id, userId: session.id } },
        update: {},
        create: { contestId: id, userId: session.id },
      }),
      prisma.contestParticipation.upsert({
        where: { contestId_userId_mode: { contestId: id, userId: session.id, mode: "LIVE" } },
        update: {},
        create: { contestId: id, userId: session.id, mode: "LIVE", official: true },
      }),
    ]);

    return NextResponse.json({ ok: true, message: "Joined", contestId: id });
  } catch (err) {
    return toResponse(err);
  }
}
