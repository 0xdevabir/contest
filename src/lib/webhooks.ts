import { createHmac, randomBytes } from "crypto";
import { Queue } from "bullmq";
import { prisma } from "./db";
import { getRedis } from "./redis";
import { log } from "./log";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import type { SessionUser } from "./auth";

/** Webhooks section (docs/phases/PHASE-12-platform-api.md) — the event
 * catalogue a webhook may subscribe to. */
export const WEBHOOK_EVENTS = [
  "contest.started",
  "contest.ended",
  "submission.judged",
  "assignment.due_soon",
  "problem.published",
  "rating.updated",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(v: string): v is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(v);
}

const RETRY_DELAYS_SEC = [1, 10, 60, 600, 3600];
const MAX_CONSECUTIVE_FAILURES = 5;

export const WEBHOOK_QUEUE_NAME = "webhook-delivery";

let queue: Queue | null | undefined;

function getWebhookQueue(): Queue | null {
  if (queue !== undefined) return queue;
  const redis = getRedis();
  queue = redis ? new Queue(WEBHOOK_QUEUE_NAME, { connection: redis }) : null;
  return queue;
}

export type WebhookDeliveryJobData = { deliveryId: string; attempt: number };

export async function createWebhook(apiKeyId: string, opts: { url: string; events: string[] }) {
  let parsed: URL;
  try {
    parsed = new URL(opts.url);
  } catch {
    throw new ValidationError("Invalid webhook URL.");
  }
  if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new ValidationError("Webhook URLs must use https:// in production.");
  }
  const events = [...new Set(opts.events)];
  if (events.length === 0) throw new ValidationError("Select at least one event.");
  for (const e of events) if (!isWebhookEvent(e)) throw new ValidationError(`Unknown event: ${e}`);

  return prisma.webhook.create({
    data: { apiKeyId, url: opts.url, events, secret: randomBytes(32).toString("hex") },
  });
}

async function requireOwnedWebhook(webhookId: string, actor: SessionUser) {
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId }, include: { apiKey: true } });
  if (!webhook) throw new NotFoundError("Webhook not found");
  if (webhook.apiKey.userId !== actor.id && actor.role !== "ADMIN") throw new ForbiddenError();
  return webhook;
}

export async function listWebhooksForUser(userId: string) {
  return prisma.webhook.findMany({
    where: { apiKey: { userId } },
    include: { apiKey: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteWebhook(webhookId: string, actor: SessionUser) {
  await requireOwnedWebhook(webhookId, actor);
  await prisma.webhook.delete({ where: { id: webhookId } });
}

export async function listDeliveries(webhookId: string, actor: SessionUser) {
  await requireOwnedWebhook(webhookId, actor);
  return prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export function signPayload(secret: string, rawBody: string, timestamp: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * Fires an event to every active webhook subscribed to it. Called from
 * inside the mutations that produce these events (contest-lifecycle.ts,
 * submission-effects.ts, problem-authoring.ts, rating/compute.ts) — never
 * awaited on the caller's critical path, matching src/lib/notify's
 * fire-and-forget convention.
 */
export async function fireWebhookEvent(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  try {
    const webhooks = await prisma.webhook.findMany({ where: { active: true, events: { has: event } } });
    if (webhooks.length === 0) return;

    const rows = await prisma.$transaction(
      webhooks.map((w) =>
        prisma.webhookDelivery.create({
          data: { webhookId: w.id, event, payload: payload as never },
        })
      )
    );

    const q = getWebhookQueue();
    for (const row of rows) {
      if (q) {
        await q.add(
          "deliver",
          { deliveryId: row.id, attempt: 1 } satisfies WebhookDeliveryJobData,
          { jobId: `${row.id}:1`, delay: 0, removeOnComplete: 500, removeOnFail: 500 }
        );
      } else {
        // No queue configured (dev without Redis) — deliver inline, best-effort.
        await deliverWebhookAttempt(row.id, 1).catch(() => undefined);
      }
    }
  } catch (err) {
    log.warn("fireWebhookEvent failed", { event, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * One delivery attempt: signs the body, POSTs it, records the outcome, and
 * either schedules the next retry (1s/10s/1m/10m/1h) or — after 5
 * consecutive failures — disables the webhook and stops.
 */
export async function deliverWebhookAttempt(deliveryId: string, attempt: number): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { webhook: true } });
  if (!delivery || !delivery.webhook.active) return;

  const rawBody = JSON.stringify(delivery.payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signPayload(delivery.webhook.secret, rawBody, timestamp);

  let status: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(delivery.webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ContestHub-Signature": `sha256=${signature}`,
        "X-ContestHub-Timestamp": timestamp,
        "X-ContestHub-Event": delivery.event,
      },
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const ok = status !== null && status >= 200 && status < 300;

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: { status, attempt, error, deliveredAt: ok ? new Date() : null },
  });

  if (ok) {
    await prisma.webhook.update({ where: { id: delivery.webhookId }, data: { failCount: 0 } });
    return;
  }

  const webhook = await prisma.webhook.update({
    where: { id: delivery.webhookId },
    data: { failCount: { increment: 1 }, lastFailAt: new Date() },
  });

  if (webhook.failCount >= MAX_CONSECUTIVE_FAILURES) {
    await prisma.webhook.update({ where: { id: webhook.id }, data: { active: false } });
    log.warn("webhook auto-disabled after repeated failures", { webhookId: webhook.id });
    return;
  }

  const nextAttempt = attempt + 1;
  const delaySec = RETRY_DELAYS_SEC[Math.min(attempt - 1, RETRY_DELAYS_SEC.length - 1)];
  const q = getWebhookQueue();
  if (q && nextAttempt <= RETRY_DELAYS_SEC.length) {
    await q.add(
      "deliver",
      { deliveryId, attempt: nextAttempt } satisfies WebhookDeliveryJobData,
      { jobId: `${deliveryId}:${nextAttempt}`, delay: delaySec * 1000, removeOnComplete: 500, removeOnFail: 500 }
    );
  }
}
