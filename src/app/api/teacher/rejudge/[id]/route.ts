import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Progress + diff summary for a rejudge batch (D5's "how many verdicts change, and how" report). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    assertCan(session, "submission:rejudge");
    const { id } = await params;

    const batch = await prisma.rejudgeBatch.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true, email: true } },
        submissions: {
          select: {
            id: true,
            userId: true,
            problemId: true,
            verdict: true,
            score: true,
            shadowReport: true,
            state: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });
    if (!batch) throw new NotFoundError("Rejudge batch not found");

    const rows = batch.submissions.map((s) => {
      const shadow = s.shadowReport as { verdict?: string; score?: number } | null;
      return {
        submissionId: s.id,
        userName: s.user?.name ?? "Deleted user",
        userEmail: s.user?.email ?? "",
        problemId: s.problemId,
        oldVerdict: s.verdict,
        oldScore: s.score,
        newVerdict: shadow?.verdict ?? null,
        newScore: shadow?.score ?? null,
        pending: s.state === "QUEUED" || s.state === "JUDGING",
      };
    });

    return NextResponse.json({
      ok: true,
      batch: {
        id: batch.id,
        scope: batch.scope,
        scopeId: batch.scopeId,
        reason: batch.reason,
        dryRun: batch.dryRun,
        total: batch.total,
        completed: batch.completed,
        changed: batch.changed,
        diffSummary: batch.diffSummary,
        appliedAt: batch.appliedAt,
        createdAt: batch.createdAt,
        createdBy: batch.createdBy,
      },
      rows,
    });
  } catch (err) {
    return toResponse(err);
  }
}
