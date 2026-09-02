import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { getMyTeam } from "@/lib/teams";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { toResponse, AuthError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  question: z.string().trim().min(1).max(2000),
  problemId: z.string().trim().max(64).optional(),
});

/**
 * D1 — a private thread between one asker and staff. GET returns everyone's
 * threads to staff, only the caller's own to a student — enforced by the
 * `where` clause, not by filtering after the fact, so it can't leak a page
 * of someone else's questions.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) throw new AuthError();

    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("view")) throw new ForbiddenError();
    const isStaff = caps.has("viewAllSubmissions");

    const clarifications = await prisma.contestClarification.findMany({
      where: isStaff ? { contestId: id } : { contestId: id, userId: session.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        problemId: true,
        question: true,
        answer: true,
        status: true,
        answeredById: true,
        answeredAt: true,
        createdAt: true,
        user: { select: { name: true } },
      },
      take: 200,
    });

    return NextResponse.json({ ok: true, clarifications });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) throw new AuthError();

    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    // contestCapabilities() takes registration status as an explicit
    // argument rather than looking it up itself (see src/lib/contest-access.ts)
    // — the "submit" capability needs it, unlike the "view" check GET uses.
    const participation = await prisma.contestParticipation.findUnique({
      where: { contestId_userId_mode: { contestId: id, userId: session.id, mode: "LIVE" } },
      select: { mode: true, official: true },
    });
    const caps = await contestCapabilities(session, contest, participation);
    if (!caps.has("submit")) throw new ForbiddenError("Register for the contest first");

    const limited = await consume({ bucket: "clarification:ask", identity: session.id }, { tokens: 20, windowSec: 3600 });
    if (!limited.ok) throw new RateLimitError(retryAfterSeconds(limited.resetAt));

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const team = await getMyTeam(id, session.id);

    const clarification = await prisma.contestClarification.create({
      data: {
        contestId: id,
        userId: session.id,
        teamId: team?.id ?? null,
        problemId: parsed.data.problemId || null,
        question: parsed.data.question,
      },
    });

    return NextResponse.json({ ok: true, clarification });
  } catch (err) {
    return toResponse(err);
  }
}
