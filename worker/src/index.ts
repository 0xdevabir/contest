import { randomUUID } from "crypto";
import { hostname } from "os";
import { Worker, type Job } from "bullmq";
import type { Verdict } from "@prisma/client";
import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { log } from "@/lib/log";
import { JUDGE_QUEUE_NAME, type JudgeJobData } from "@/lib/queue/queue";
import { claimSubmission, reportSubmission, reportShadow, failSubmission, maxAttempts } from "@/lib/submission-state";
import { acquireUserSlot, releaseUserSlot } from "@/lib/queue/fairness";
import { applyJudgedSideEffects } from "@/lib/submission-effects";
import { publishSubmissionEvent } from "@/lib/pubsub";
import { getProblem, getProblemRef } from "@/lib/problems";
import { compileAndJudge } from "@/lib/judge";
import { startHeartbeat } from "./heartbeat";
import { startReaper } from "./reaper";

const WORKER_ID = process.env.WORKER_ID || `${hostname()}-${randomUUID().slice(0, 8)}`;
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 4);
const WORKER_VERSION = process.env.npm_package_version || "0.0.0";

async function registerWorker(): Promise<void> {
  await prisma.judgeWorker.upsert({
    where: { id: WORKER_ID },
    create: {
      id: WORKER_ID,
      hostname: hostname(),
      languages: ["c"],
      concurrency: CONCURRENCY,
      version: WORKER_VERSION,
      startedAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: { lastSeenAt: new Date(), concurrency: CONCURRENCY, version: WORKER_VERSION },
  });
}

async function touchWorker(delta: { judged?: boolean; failed?: boolean }): Promise<void> {
  await prisma.judgeWorker
    .update({
      where: { id: WORKER_ID },
      data: {
        lastSeenAt: new Date(),
        judgedCount: delta.judged ? { increment: 1 } : undefined,
        failedCount: delta.failed ? { increment: 1 } : undefined,
      },
    })
    .catch(() => undefined);
}

/**
 * Processes one judge job. Mirrors the synchronous path in
 * src/app/api/judge/route.ts exactly (same `compileAndJudge` call, same
 * problem lookup) so a submission judges identically whether `judgeQueue`
 * is on or off — this phase changes *when* judging happens, not *how*.
 */
async function processJudgeJob(job: Job<JudgeJobData>): Promise<void> {
  const { submissionId } = job.data;

  const claimed = await claimSubmission(submissionId, WORKER_ID);
  if (!claimed) {
    // Another worker already claimed it, or it's no longer QUEUED
    // (e.g. a duplicate job from a requeue race) — ack and drop.
    return;
  }

  if (!claimed.userId) {
    await failSubmission(submissionId, WORKER_ID, "Queued submission has no owning user.");
    return;
  }

  const gotSlot = await acquireUserSlot(claimed.userId);
  const stopHeartbeat = startHeartbeat(submissionId, WORKER_ID);

  try {
    await publishSubmissionEvent(submissionId, { event: "state", data: { state: "JUDGING", attempt: claimed.attempts } });

    const problem = await getProblem(claimed.problemId);
    if (!problem) {
      await failSubmission(submissionId, WORKER_ID, "Problem no longer exists.");
      return;
    }

    const result = await compileAndJudge({
      code: claimed.code,
      tests: problem.tests,
      timeLimitMs: problem.timeLimitMs,
    });

    const failing = result.results.find((r) => r.verdict !== "AC");
    const shown = failing ?? result.results[result.results.length - 1];
    const maxTime = result.results.reduce((m, r) => Math.max(m, r.timeMs), 0);

    const rejudgeBatch = claimed.rejudgeBatchId
      ? await prisma.rejudgeBatch.findUnique({ where: { id: claimed.rejudgeBatchId }, select: { dryRun: true } })
      : null;

    if (rejudgeBatch?.dryRun) {
      const shadowOk = await reportShadow(submissionId, WORKER_ID, result);
      if (shadowOk) {
        await recordRejudgeProgress(claimed.rejudgeBatchId!, claimed.verdict, result.verdict as Verdict);
      }
    } else {
      const reported = await reportSubmission(submissionId, WORKER_ID, {
        verdict: result.verdict as Verdict,
        timeMs: result.results.length ? maxTime : undefined,
        stdout: shown?.sample ? shown.stdout : undefined,
        stderr: result.compileStderr || shown?.stderr,
        report: result,
      });
      if (reported) {
        const ref = await getProblemRef(claimed.problemId).catch(() => null);
        await applyJudgedSideEffects({
          userId: claimed.userId,
          problemId: claimed.problemId,
          contestId: claimed.contestId,
          verdict: result.verdict as Verdict,
          problemRefId: ref?.problemId,
          submissionId,
          code: claimed.code,
          language: "c",
        });
      }
    }

    await publishSubmissionEvent(submissionId, {
      event: "result",
      data: { verdict: result.verdict, score: result.score ?? 0, maxScore: result.maxScore ?? 0 },
    });
    await touchWorker({ judged: true });
  } catch (err) {
    log.error("judge job failed", { submissionId, attempts: claimed.attempts }, err);
    if (claimed.attempts > maxAttempts()) {
      await failSubmission(submissionId, WORKER_ID, err instanceof Error ? err.message : String(err));
      await publishSubmissionEvent(submissionId, { event: "result", data: { verdict: "IE", score: 0, maxScore: 0 } });
    } else {
      // Leave it JUDGING with a stale heartbeat — the reaper requeues it.
      // Re-throwing lets BullMQ's own retry/stalled bookkeeping see the failure too.
      throw err;
    }
    await touchWorker({ failed: true });
  } finally {
    stopHeartbeat();
    if (gotSlot) await releaseUserSlot(claimed.userId);
  }
}

async function recordRejudgeProgress(batchId: string, oldVerdict: Verdict, newVerdict: Verdict): Promise<void> {
  const changed = oldVerdict !== newVerdict;
  const batch = await prisma.rejudgeBatch.findUnique({ where: { id: batchId } });
  const diffSummary = (batch?.diffSummary as Record<string, number>) ?? {};
  if (changed) {
    const key = `${oldVerdict}->${newVerdict}`;
    diffSummary[key] = (diffSummary[key] ?? 0) + 1;
  }
  await prisma.rejudgeBatch.update({
    where: { id: batchId },
    data: {
      completed: { increment: 1 },
      changed: changed ? { increment: 1 } : undefined,
      diffSummary,
    },
  });
}

async function main(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    log.error("worker cannot start: REDIS_URL is not configured", {});
    process.exit(1);
  }

  await registerWorker();
  const stopReaper = startReaper();

  const worker = new Worker<JudgeJobData>(JUDGE_QUEUE_NAME, processJudgeJob, {
    connection: redis,
    concurrency: CONCURRENCY,
    lockDuration: 60_000,
  });

  worker.on("failed", (job, err) => {
    log.warn("judge job failed (will be retried or reaped)", { jobId: job?.id, error: err.message });
  });

  const shutdown = async () => {
    log.info("worker shutting down", { workerId: WORKER_ID });
    stopReaper();
    await worker.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  log.info("judge worker started", { workerId: WORKER_ID, concurrency: CONCURRENCY });
}

main().catch((err) => {
  log.error("worker crashed on startup", {}, err);
  process.exit(1);
});
