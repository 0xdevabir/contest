import { Worker, type Job } from "bullmq";
import { getRedis } from "@/lib/redis";
import { log } from "@/lib/log";
import { IMPORT_QUEUE_NAME, runImportJob, type ImportJobData } from "@/lib/import/runner";

const CONCURRENCY = Number(process.env.IMPORT_WORKER_CONCURRENCY || 2);

async function main(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    log.error("import worker cannot start: REDIS_URL is not configured", {});
    process.exit(1);
  }

  const worker = new Worker<ImportJobData>(
    IMPORT_QUEUE_NAME,
    async (job: Job<ImportJobData>) => {
      await runImportJob(job.data.jobId);
    },
    { connection: redis, concurrency: CONCURRENCY }
  );

  worker.on("failed", (job, err) => {
    log.warn("import job failed", { jobId: job?.id, error: err.message });
  });

  const shutdown = async () => {
    log.info("import worker shutting down", {});
    await worker.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  log.info("import worker started", { concurrency: CONCURRENCY });
}

main().catch((err) => {
  log.error("import worker crashed on startup", {}, err);
  process.exit(1);
});
