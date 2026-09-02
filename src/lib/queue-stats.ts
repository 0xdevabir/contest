import { prisma } from "./db";
import { getJudgeQueue } from "./queue/queue";
import { redisAvailable } from "./redis";

export type QueueStats = {
  redisUp: boolean;
  depthByPriority: Array<{ priority: number; count: number }>;
  oldestQueuedAgeSec: number | null;
  throughput: { perMin1: number; perMin5: number; perMin15: number };
  workers: Array<{
    id: string;
    hostname: string;
    languages: string[];
    concurrency: number;
    version: string;
    lastSeenAt: Date;
    stale: boolean;
    judgedCount: number;
    failedCount: number;
  }>;
  ieRatePercent: number;
  stalledOrRequeuedCount: number;
};

const WORKER_STALE_MS = 2 * 60 * 1000;

/** Backs both GET /api/admin/queue and the admin/system "Judge" panel. */
export async function getQueueStats(): Promise<QueueStats> {
  const redisUp = await redisAvailable();

  const [depthRows, oldest, workers, done1, done5, done15, ieCount, doneCount, requeued] = await Promise.all([
    prisma.submission.groupBy({ by: ["priority"], where: { state: "QUEUED" }, _count: { _all: true } }),
    prisma.submission.findFirst({
      where: { state: "QUEUED" },
      orderBy: { queuedAt: "asc" },
      select: { queuedAt: true },
    }),
    prisma.judgeWorker.findMany({ orderBy: { lastSeenAt: "desc" } }),
    prisma.submission.count({ where: { state: "DONE", judgedAt: { gte: new Date(Date.now() - 60_000) } } }),
    prisma.submission.count({ where: { state: "DONE", judgedAt: { gte: new Date(Date.now() - 5 * 60_000) } } }),
    prisma.submission.count({ where: { state: "DONE", judgedAt: { gte: new Date(Date.now() - 15 * 60_000) } } }),
    prisma.submission.count({
      where: { verdict: "IE", judgedAt: { gte: new Date(Date.now() - 5 * 60_000) } },
    }),
    prisma.submission.count({
      where: { state: "DONE", judgedAt: { gte: new Date(Date.now() - 5 * 60_000) } },
    }),
    prisma.submission.count({ where: { state: "QUEUED", attempts: { gt: 0 } } }),
  ]);

  const now = Date.now();
  return {
    redisUp,
    depthByPriority: depthRows
      .map((r) => ({ priority: r.priority, count: r._count._all }))
      .sort((a, b) => a.priority - b.priority),
    oldestQueuedAgeSec: oldest?.queuedAt ? Math.round((now - oldest.queuedAt.getTime()) / 1000) : null,
    throughput: { perMin1: done1, perMin5: done5, perMin15: done15 },
    workers: workers.map((w) => ({
      id: w.id,
      hostname: w.hostname,
      languages: w.languages,
      concurrency: w.concurrency,
      version: w.version,
      lastSeenAt: w.lastSeenAt,
      stale: now - w.lastSeenAt.getTime() > WORKER_STALE_MS,
      judgedCount: w.judgedCount,
      failedCount: w.failedCount,
    })),
    ieRatePercent: doneCount > 0 ? Math.round((ieCount / doneCount) * 1000) / 10 : 0,
    stalledOrRequeuedCount: requeued,
  };
}

export async function isQueuePaused(): Promise<boolean> {
  const q = getJudgeQueue();
  if (!q) return false;
  return q.isPaused();
}
