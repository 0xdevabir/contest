import { prisma } from "./db";
import type { Submission, Verdict } from "@prisma/client";

const MAX_ATTEMPTS = 3;

/**
 * Conditional claim (D2): a worker wins the row only if it's still QUEUED.
 * Zero rows back means another worker won first — the caller acks the job
 * and drops it, no error. This is what makes claiming safe under concurrent
 * workers without a distributed lock.
 */
export async function claimSubmission(submissionId: string, workerId: string): Promise<Submission | null> {
  const rows = await prisma.$queryRaw<Submission[]>`
    UPDATE "Submission"
       SET state = 'JUDGING', "claimedBy" = ${workerId}, "claimedAt" = now(),
           "heartbeatAt" = now(), attempts = attempts + 1
     WHERE id = ${submissionId} AND state = 'QUEUED'
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function touchHeartbeat(submissionId: string, workerId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Submission"
       SET "heartbeatAt" = now()
     WHERE id = ${submissionId} AND state = 'JUDGING' AND "claimedBy" = ${workerId}
  `;
}

export type ReportPatch = {
  verdict: Verdict;
  score?: number;
  maxScore?: number;
  timeMs?: number;
  maxCpuMs?: number;
  maxWallMs?: number;
  maxMemoryKb?: number;
  compileMs?: number;
  stdout?: string | null;
  stderr?: string | null;
  report?: unknown;
  judgeImage?: string | null;
};

/**
 * Conditional report (D2): only applies if this worker still holds the
 * claim. A duplicated report (retry, HMAC fallback racing the direct path)
 * is a no-op — the exactly-once property, achieved without a distributed
 * transaction because Postgres is already the single source of truth.
 */
export async function reportSubmission(
  submissionId: string,
  workerId: string,
  patch: ReportPatch
): Promise<boolean> {
  const result = await prisma.submission.updateMany({
    where: { id: submissionId, state: "JUDGING", claimedBy: workerId },
    data: {
      state: "DONE",
      judgedAt: new Date(),
      verdict: patch.verdict,
      score: patch.score,
      maxScore: patch.maxScore,
      timeMs: patch.timeMs,
      maxCpuMs: patch.maxCpuMs,
      maxWallMs: patch.maxWallMs,
      maxMemoryKb: patch.maxMemoryKb,
      compileMs: patch.compileMs,
      stdout: patch.stdout?.slice(0, 8000),
      stderr: patch.stderr?.slice(0, 8000),
      report: patch.report != null ? JSON.parse(JSON.stringify(patch.report)) : undefined,
      judgeImage: patch.judgeImage,
    },
  });
  return result.count > 0;
}

/**
 * Reports into `shadowReport` for a dry-run rejudge — never touches the
 * live verdict/score. Also conditional on the claim for the same
 * exactly-once reason as `reportSubmission`.
 */
export async function reportShadow(submissionId: string, workerId: string, report: unknown): Promise<boolean> {
  const result = await prisma.submission.updateMany({
    where: { id: submissionId, state: "JUDGING", claimedBy: workerId },
    data: { state: "DONE", judgedAt: new Date(), shadowReport: JSON.parse(JSON.stringify(report)) },
  });
  return result.count > 0;
}

/** Marks a submission permanently failed after exhausting retries — never the submitter's fault. */
export async function failSubmission(submissionId: string, workerId: string, message: string): Promise<boolean> {
  const result = await prisma.submission.updateMany({
    where: { id: submissionId, state: "JUDGING", claimedBy: workerId },
    data: { state: "FAILED", verdict: "IE", judgedAt: new Date(), stderr: message.slice(0, 8000) },
  });
  return result.count > 0;
}

export function maxAttempts(): number {
  return MAX_ATTEMPTS;
}
