import webpush from "web-push";
import { prisma } from "@/lib/db";
import { log } from "@/lib/log";

let configured = false;
let warnedOnce = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@example.com";
  if (!pub || !priv) {
    if (!warnedOnce) {
      log.warn("web push is not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing) — push delivery disabled", {});
      warnedOnce = true;
    }
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

/** Delivers one notification's payload to every push subscription on file
 * for a batch of users. Dead endpoints (410/404) are removed on the spot —
 * the bounce-handling equivalent for push (D4). */
export async function deliverPushBatch(
  userIds: string[],
  content: { title: string; body: string; href: string | null }
): Promise<void> {
  if (userIds.length === 0) return;
  if (!ensureConfigured()) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  const payload = JSON.stringify(content);

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          log.error("push delivery failed", { subscriptionId: sub.id, statusCode }, err);
        }
      }
    })
  );
}
