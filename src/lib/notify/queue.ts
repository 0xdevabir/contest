import { Queue } from "bullmq";
import { getRedis } from "@/lib/redis";
import type { NotificationType } from "./types";
import { deliverEmailBatch } from "./channels/email";
import { deliverPushBatch } from "./channels/push";

export const NOTIFY_QUEUE_NAME = "notify-delivery";

let queue: Queue | null | undefined;

function getNotifyQueue(): Queue | null {
  if (queue !== undefined) return queue;
  const redis = getRedis();
  if (!redis) {
    queue = null;
    return queue;
  }
  queue = new Queue(NOTIFY_QUEUE_NAME, { connection: redis });
  return queue;
}

export type NotifyDeliveryJobData = {
  channel: "EMAIL" | "PUSH";
  type: NotificationType;
  userIds: string[];
  title: string;
  body: string;
  href: string | null;
};

/** Runs one channel's delivery inline — shared by the BullMQ worker
 * (worker/src/notify-worker.ts) and the no-Redis fallback below, so the two
 * paths can never drift. */
export async function deliverNotifyJob(data: NotifyDeliveryJobData): Promise<void> {
  if (data.channel === "EMAIL") {
    await deliverEmailBatch(data.type, data.userIds, { title: data.title, body: data.body, href: data.href });
  } else {
    await deliverPushBatch(data.userIds, { title: data.title, body: data.body, href: data.href });
  }
}

/**
 * Enqueues exactly one delivery job for a whole batch of users (D4: "creates
 * rows in one createMany and enqueues one batched delivery job per channel,
 * not 500 jobs"). Falls back to delivering inline when Redis/BullMQ is
 * unconfigured — same graceful-degradation shape as src/lib/ratelimit.ts and
 * src/lib/queue/queue.ts elsewhere in this repo.
 */
export async function enqueueNotifyDelivery(data: NotifyDeliveryJobData): Promise<void> {
  const q = getNotifyQueue();
  if (!q) {
    await deliverNotifyJob(data);
    return;
  }
  await q.add("deliver", data, { removeOnComplete: 500, removeOnFail: 500 });
}
