import type { AiJobKind, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { checkBudget, recordUsage } from "./budget";
import { getCachedResponse, hashInput, setCachedResponse } from "./cache";
import { MODEL, type UsageSummary } from "./client";

/**
 * The one funnel every AI feature runs through (see the Architecture
 * section of docs/phases/PHASE-15-intelligence.md): schema-validated input
 * -> budget check -> cached? -> API call -> schema-validated output ->
 * persisted as an AiJob, regardless of outcome. Guardrails and "persist as
 * a draft, wait for review" are feature-specific and happen around this
 * call, not inside it.
 */
export type AiJobRunner<T> = {
  kind: AiJobKind;
  requestedById: string;
  institutionId: string | null;
  /** Full input payload — also the cache/dedup key via hashInput(). */
  input: Prisma.InputJsonValue;
  run: () => Promise<{ data: T; usage: UsageSummary }>;
};

export async function runAiJob<T>(opts: AiJobRunner<T>): Promise<{ jobId: string; data: T; cached: boolean }> {
  const inputHash = hashInput(opts.input);

  const cached = await getCachedResponse<T>(opts.kind, inputHash);
  if (cached !== undefined) {
    const job = await prisma.aiJob.create({
      data: {
        kind: opts.kind,
        status: "SUCCEEDED",
        requestedById: opts.requestedById,
        institutionId: opts.institutionId,
        inputHash,
        input: opts.input,
        output: cached as Prisma.InputJsonValue,
        model: MODEL,
        finishedAt: new Date(),
      },
    });
    return { jobId: job.id, data: cached, cached: true };
  }

  await checkBudget(opts.institutionId);

  const job = await prisma.aiJob.create({
    data: {
      kind: opts.kind,
      status: "RUNNING",
      requestedById: opts.requestedById,
      institutionId: opts.institutionId,
      inputHash,
      input: opts.input,
      model: MODEL,
    },
  });

  try {
    const { data, usage } = await opts.run();

    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        output: data as Prisma.InputJsonValue,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        costCents: usage.costCents,
        finishedAt: new Date(),
      },
    });
    await recordUsage(opts.institutionId, usage.costCents);
    await setCachedResponse(opts.kind, inputHash, data);

    return { jobId: job.id, data, cached: false };
  } catch (err) {
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() },
    });
    throw err;
  }
}

/** Records a human's accept/edit/reject decision on a job's draft output —
 * "every AI output persists as a draft; nothing is published without a
 * review record" (testing plan, integration tier). */
export async function reviewAiJob(jobId: string, reviewedById: string, accepted: boolean): Promise<void> {
  await prisma.aiJob.update({
    where: { id: jobId },
    data: { reviewedById, reviewedAt: new Date(), accepted },
  });
}
