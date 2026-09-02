import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toResponse, NotFoundError, AuthError, ForbiddenError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAFF_ROLES = new Set(["ADMIN", "TEACHER", "TA"]);

/** Polling fallback for /api/submissions/[id]/stream — same state/report shape either way. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) throw new AuthError();

    const submission = await prisma.submission.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        state: true,
        verdict: true,
        score: true,
        maxScore: true,
        timeMs: true,
        attempts: true,
        report: true,
        createdAt: true,
        judgedAt: true,
        code: true,
      },
    });
    if (!submission) throw new NotFoundError("Submission not found");

    const isOwner = submission.userId === session.id;
    const isStaff = STAFF_ROLES.has(session.role);
    if (!isOwner && !isStaff) throw new ForbiddenError();

    return NextResponse.json({
      ok: true,
      id: submission.id,
      state: submission.state,
      verdict: submission.verdict,
      score: submission.score,
      maxScore: submission.maxScore,
      timeMs: submission.timeMs,
      attempts: submission.attempts,
      report: isStaff || isOwner ? submission.report : undefined,
      // Raw source is only for the integrity console's diff toggle (D2) —
      // never sent to a non-owner, non-staff caller.
      code: isStaff || isOwner ? submission.code : undefined,
    });
  } catch (err) {
    return toResponse(err);
  }
}
