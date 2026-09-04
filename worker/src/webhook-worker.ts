import { Worker, type Job } from "bullmq";
import { getRedis } from "@/lib/redis";
import { log } from "@/lib/log";
import { WEBHOOK_QUEUE_NAME, deliverWebhookAttempt, type WebhookDeliveryJobData } from "@/lib/webhooks";

const CONCURRENCY = Number(process.env.WEBHOOK_WORKER_CONCURRENCY || 4);

async function main(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    log.error("webhook worker cannot start: REDIS_URL is not configured", {});
    process.exit(1);
  }

  const worker = new Worker<WebhookDeliveryJobData>(
    WEBHOOK_QUEUE_NAME,
    async (job: Job<WebhookDeliveryJobData>) => {
      await deliverWebhookAttempt(job.data.deliveryId, job.data.attempt);
    },
    { connection: redis, concurrency: CONCURRENCY }
  );

  worker.on("failed", (job, err) => {
    log.warn("webhook delivery job failed", { jobId: job?.id, error: err.message });
  });

  const shutdown = async () => {
    log.info("webhook worker shutting down", {});
    await worker.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  log.info("webhook worker started", { concurrency: CONCURRENCY });
}

main().catch((err) => {
  log.error("webhook worker crashed on startup", {}, err);
  process.exit(1);
});
