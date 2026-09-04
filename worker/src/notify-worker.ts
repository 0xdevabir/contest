import { Worker, type Job } from "bullmq";
import { getRedis } from "@/lib/redis";
import { log } from "@/lib/log";
import { NOTIFY_QUEUE_NAME, deliverNotifyJob, type NotifyDeliveryJobData } from "@/lib/notify/queue";

const CONCURRENCY = Number(process.env.NOTIFY_WORKER_CONCURRENCY || 4);

async function main(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    log.error("notify worker cannot start: REDIS_URL is not configured", {});
    process.exit(1);
  }

  const worker = new Worker<NotifyDeliveryJobData>(
    NOTIFY_QUEUE_NAME,
    async (job: Job<NotifyDeliveryJobData>) => {
      await deliverNotifyJob(job.data);
    },
    { connection: redis, concurrency: CONCURRENCY }
  );

  worker.on("failed", (job, err) => {
    log.warn("notify delivery job failed", { jobId: job?.id, error: err.message });
  });

  const shutdown = async () => {
    log.info("notify worker shutting down", {});
    await worker.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  log.info("notify worker started", { concurrency: CONCURRENCY });
}

main().catch((err) => {
  log.error("notify worker crashed on startup", {}, err);
  process.exit(1);
});
