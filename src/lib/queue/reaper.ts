import { prisma } from "../db";
import { log } from "../log";
import { enqueueJudgeJob } from "./queue";
import { maxAttempts } from "../submission-state";

/**
 * Re-queues submissions whose worker died mid-judge (heartbeat gone stale)
 * and permanently fails ones that have exhausted their attempts (D2). Called
 * on an interval by the worker process (worker/src/reaper.ts) — independent
 * of BullMQ's own stalled-job detection, because a worker can die in a way
 * that never returns the job to BullMQ at all (killed, OOM, host loss).
 */
export async function reapStalledSubmissions(): Promise<{ requeued: number; failed: number }> {
  // The 90s threshold is a literal, not a bound parameter — an interval
  // literal must appear inside the quoted string itself.
  const stale = await prisma.$queryRaw<Array<{ id: string; attempts: number }>>`
    SELECT id, attempts FROM "Submission"
     WHERE state = 'JUDGING' AND "heartbeatAt" < now() - interval '90 seconds'
  `;

  let requeued = 0;
  let failed = 0;

  for (const row of stale) {
    if (row.attempts > maxAttempts()) {
      const result = await prisma.submission.updateMany({
        where: { id: row.id, state: "JUDGING" },
        data: { state: "FAILED", verdict: "IE", judgedAt: new Date() },
      });
      if (result.count > 0) {
        failed++;
        log.warn("submission failed after max attempts", { submissionId: row.id, attempts: row.attempts });
      }
      continue;
    }

    const result = await prisma.submission.updateMany({
      where: { id: row.id, state: "JUDGING" },
      data: { state: "QUEUED", claimedBy: null, claimedAt: null, heartbeatAt: null },
    });
    if (result.count > 0) {
      const submission = await prisma.submission.findUnique({ where: { id: row.id }, select: { priority: true } });
      await enqueueJudgeJob({ submissionId: row.id, priority: submission?.priority ?? 10, attempt: row.attempts });
      requeued++;
      log.warn("submission requeued after stalled worker", { submissionId: row.id, attempts: row.attempts });
    }
  }

  return { requeued, failed };
}
