import { getRedis } from "@/lib/redis";

/** Per-user pub/sub channel for the live notification bell — same pattern
 * as src/lib/pubsub.ts's per-submission/per-contest channels. */
export function notifChannel(userId: string): string {
  return `notif:${userId}`;
}

export type InAppEvent = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
};

/** Best-effort live push to a signed-in user's open notification bell.
 * No-op when Redis is unconfigured — the row already exists in Postgres,
 * so a page refresh (or the next SSE reconnect) still surfaces it. */
export async function publishInApp(userId: string, evt: InAppEvent): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.publish(notifChannel(userId), JSON.stringify(evt));
}
