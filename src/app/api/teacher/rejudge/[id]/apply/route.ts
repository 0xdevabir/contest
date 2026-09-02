import { NextResponse } from "next/server";
import type { Verdict } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse, NotFoundError, ValidationError } from "@/lib/errors";
import { applyJudgedSideEffects } from "@/lib/submission-effects";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

type ShadowReport = { verdict?: string; score?: number; maxScore?: number };

/**
 * Commits a dry-run rejudge's shadow results to the live verdict/score
 * (D5). Only reachable on a `dryRun: true` batch — applying a non-dry-run
 * batch is a no-op since that batch already wrote directly to `verdict` as
 * it judged.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    assertCan(session, "submission:rejudge");
    const { id } = await params;

    const batch = await prisma.rejudgeBatch.findUnique({
      where: { id },
      include: { submissions: true },
    });
    if (!batch) throw new NotFoundError("Rejudge batch not found");
    if (!batch.dryRun) throw new ValidationError("This batch was not a dry run.");
    if (batch.appliedAt) throw new ValidationError("This batch has already been applied.");
    if (batch.completed < batch.total) {
      throw new ValidationError("This batch has not finished judging yet.");
    }

    for (const submission of batch.submissions) {
      const shadow = submission.shadowReport as ShadowReport | null;
      if (!shadow?.verdict) continue;

      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          verdict: shadow.verdict as Verdict,
          score: shadow.score ?? submission.score,
          maxScore: shadow.maxScore ?? submission.maxScore,
          report: submission.shadowReport ?? undefined,
        },
      });

      if (submission.userId && shadow.verdict !== submission.verdict) {
        await applyJudgedSideEffects({
          userId: submission.userId,
          problemId: submission.problemId,
          contestId: submission.contestId,
          verdict: shadow.verdict as Verdict,
          problemRefId: submission.problemRefId,
        });
      }
    }

    await prisma.rejudgeBatch.update({ where: { id: batch.id }, data: { appliedAt: new Date() } });
    await recordAdminAction({
      actorId: session.id,
      action: "REJUDGE_APPLIED",
      targetType: "SYSTEM",
      targetId: batch.id,
      details: { scope: batch.scope, scopeId: batch.scopeId, changed: batch.changed, total: batch.total },
    });

    return NextResponse.json({ ok: true, applied: batch.submissions.length });
  } catch (err) {
    return toResponse(err);
  }
}
