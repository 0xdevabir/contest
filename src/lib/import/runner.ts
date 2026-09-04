import { Queue } from "bullmq";
import { prisma } from "../db";
import { getRedis } from "../redis";
import { getBlobStore } from "../blob";
import { log } from "../log";
import { parsePolygonPackage } from "./polygon";
import { parseGenericPackage } from "./generic";
import { parseCsvBank } from "./csv";
import type { ImportItemOutcome } from "./types";

export const IMPORT_QUEUE_NAME = "import-job";

let queue: Queue | null | undefined;

function getImportQueue(): Queue | null {
  if (queue !== undefined) return queue;
  const redis = getRedis();
  queue = redis ? new Queue(IMPORT_QUEUE_NAME, { connection: redis }) : null;
  return queue;
}

export type ImportJobData = { jobId: string };

/**
 * D3 — "must be resumable and must not fail wholesale because problem 137
 * has a malformed statement." Polygon/generic archives currently import as
 * a single item per job (D3's mapping targets one problem.xml per package);
 * CSV rows are the multi-item batch, and a bad row there never aborts the
 * rest — the per-item try/catch inside csv.ts already guarantees that.
 */
export async function runImportJob(jobId: string): Promise<void> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "DONE" || job.status === "FAILED") return;

  await prisma.importJob.update({ where: { id: jobId }, data: { status: "RUNNING" } });

  try {
    const store = getBlobStore();
    const buffer = await store.get(job.sourceKey);
    let report: ImportItemOutcome[] = [];

    if (job.kind === "polygon") {
      const outcome = await parsePolygonPackage(buffer, {
        authorId: job.userId,
        institutionId: null,
        slugPrefix: "polygon",
      });
      report = [outcome];
    } else if (job.kind === "generic") {
      const outcome = await parseGenericPackage(buffer, { authorId: job.userId, institutionId: null });
      report = [outcome];
    } else if (job.kind === "csv") {
      report = await parseCsvBank(buffer.toString("utf8"), { authorId: job.userId, institutionId: null });
    } else {
      report = [{ item: job.kind, ok: false, message: `Unknown import kind: ${job.kind}` }];
    }

    const imported = report.filter((r) => r.ok).length;
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        total: report.length,
        imported,
        failed: report.length - imported,
        report: report as unknown as object[],
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    log.error("import job failed", { jobId }, err);
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        report: [{ item: "(archive)", ok: false, message: err instanceof Error ? err.message : String(err) }] as unknown as object[],
        finishedAt: new Date(),
      },
    });
  }
}

/** Enqueues via BullMQ when Redis is configured; runs inline otherwise
 * (same graceful-degradation shape as src/lib/notify/queue.ts). */
export async function enqueueImportJob(jobId: string): Promise<void> {
  const q = getImportQueue();
  if (q) {
    await q.add("run", { jobId } satisfies ImportJobData, { jobId, removeOnComplete: 200, removeOnFail: 200 });
    return;
  }
  await runImportJob(jobId);
}
