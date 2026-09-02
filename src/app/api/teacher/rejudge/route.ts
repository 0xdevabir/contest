import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse, ValidationError, ServiceUnavailableError } from "@/lib/errors";
import { redisAvailable } from "@/lib/redis";
import { enqueueJudgeJob } from "@/lib/queue/queue";
import { JUDGE_PRIORITY } from "@/lib/queue/priority";

export const runtime = "nodejs";

const BodySchema = z.object({
  scope: z.enum(["submission", "problem", "contest", "version"]),
  scopeId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
  dryRun: z.boolean().default(true),
});

/**
 * Rejudge is a first-class, auditable operation (D5): a RejudgeBatch row and
 * a queue of jobs at priority 15 — bulk, never at a live user's expense.
 * `dryRun` (the default) judges into `shadowReport` and produces a diff
 * (see GET [id]) before anything real is committed via [id]/apply.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "submission:rejudge");

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) throw new ValidationError("Invalid rejudge request", parsed.error.flatten());
    const { scope, scopeId, reason, dryRun } = parsed.data;

    if (!(await redisAvailable())) throw new ServiceUnavailableError("Judge queue is unavailable.");

    const where =
      scope === "submission"
        ? { id: scopeId }
        : scope === "problem"
          ? { problemRefId: scopeId }
          : scope === "contest"
            ? { contestId: scopeId }
            : { problemVersionId: scopeId };

    const targets = await prisma.submission.findMany({ where, select: { id: true } });
    if (targets.length === 0) throw new ValidationError("No submissions match this scope");

    const batch = await prisma.rejudgeBatch.create({
      data: { scope, scopeId, reason, dryRun, createdById: session.id, total: targets.length },
    });

    await prisma.submission.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: { rejudgeBatchId: batch.id, state: "QUEUED", queuedAt: new Date() },
    });

    for (const target of targets) {
      await enqueueJudgeJob({ submissionId: target.id, priority: JUDGE_PRIORITY.REJUDGE });
    }

    return NextResponse.json({ ok: true, batchId: batch.id, total: targets.length });
  } catch (err) {
    return toResponse(err);
  }
}
