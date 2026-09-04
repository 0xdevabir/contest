import type { Prisma, NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { log } from "@/lib/log";
import { NOTIFICATION_TYPES, type NotificationType, type NotifyPayload } from "./types";
import { publishInApp } from "./channels/inapp";
import { enqueueNotifyDelivery } from "./queue";
import { digestEnabledUserIds } from "./digest";

/**
 * The single entry point for every notification in the app (D4). Resolution
 * order per user: an explicit NotificationPreference row for this type wins
 * outright (including an explicit "off"); otherwise the type's default
 * channel set applies. A Notification row is always written for every
 * recipient — it's the in-app history record — independent of channel
 * preference, which only governs *delivery* (email/push) and the live bell
 * push.
 *
 * Never throws: a notification bug must never take down the caller's
 * primary action (contest lifecycle, judging, comment posting, ...) — same
 * contract as src/lib/submission-effects.ts.
 */
export async function notify(
  userIdsInput: string | string[],
  type: NotificationType,
  payload: NotifyPayload
): Promise<void> {
  try {
    const userIds = Array.from(new Set(Array.isArray(userIdsInput) ? userIdsInput : [userIdsInput])).filter(Boolean);
    if (userIds.length === 0) return;

    const def = NOTIFICATION_TYPES[type];
    const title = def.title(payload);
    const body = def.body(payload);
    const href = def.href(payload);

    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type,
        title,
        body,
        href,
        payload: payload as Prisma.InputJsonValue,
      })),
    });

    const prefRows = await prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, type },
      select: { userId: true, channels: true },
    });
    const prefByUser = new Map(prefRows.map((r) => [r.userId, r.channels]));

    const inappUsers: string[] = [];
    const emailUsers: string[] = [];
    const pushUsers: string[] = [];
    for (const userId of userIds) {
      const channels: NotificationChannel[] = prefByUser.get(userId) ?? def.defaultChannels;
      if (channels.includes("INAPP")) inappUsers.push(userId);
      if (channels.includes("EMAIL")) emailUsers.push(userId);
      if (channels.includes("PUSH")) pushUsers.push(userId);
    }

    const createdAt = new Date().toISOString();
    await Promise.all(
      inappUsers.map((userId) =>
        publishInApp(userId, { id: crypto.randomUUID(), type, title, body, href, createdAt })
      )
    );

    if (emailUsers.length > 0) {
      const digestOn = await digestEnabledUserIds(emailUsers);
      const immediate = emailUsers.filter((id) => !digestOn.has(id));
      if (immediate.length > 0) {
        await enqueueNotifyDelivery({ channel: "EMAIL", type, userIds: immediate, title, body, href });
      }
    }

    if (pushUsers.length > 0) {
      await enqueueNotifyDelivery({ channel: "PUSH", type, userIds: pushUsers, title, body, href });
    }
  } catch (err) {
    log.warn("notify() failed", { type, error: err instanceof Error ? err.message : String(err) });
  }
}

export { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LIST, NOTIFICATION_TYPE_LABELS, DIGEST_PREFERENCE_TYPE } from "./types";
export type { NotificationType, NotifyPayload } from "./types";
