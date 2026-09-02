import { Queue } from "bullmq";
import { getRedis } from "../redis";

export const JUDGE_QUEUE_NAME = "judge";

let queue: Queue | null | undefined;

/** Returns null when Redis is unconfigured — callers must handle that as "queue unavailable". */
export function getJudgeQueue(): Queue | null {
  if (queue !== undefined) return queue;
  const redis = getRedis();
  if (!redis) {
    queue = null;
    return queue;
  }
  queue = new Queue(JUDGE_QUEUE_NAME, { connection: redis });
  return queue;
}

export type JudgeJobData = {
  submissionId: string;
  /** Attempt number this job represents, for jobId de-duplication on requeue. */
  attempt: number;
};

/**
 * Enqueues a judge job. `jobId` uses the submission id + attempt so the
 * initial enqueue naturally de-dupes, and the reaper's requeue (D2) gets a
 * fresh, non-colliding job id for the next attempt.
 */
export async function enqueueJudgeJob(opts: {
  submissionId: string;
  priority: number;
  attempt?: number;
}): Promise<boolean> {
  const q = getJudgeQueue();
  if (!q) return false;
  const attempt = opts.attempt ?? 0;
  await q.add(
    "judge",
    { submissionId: opts.submissionId, attempt } satisfies JudgeJobData,
    { jobId: `${opts.submissionId}:${attempt}`, priority: opts.priority, removeOnComplete: 500, removeOnFail: 500 }
  );
  return true;
}
