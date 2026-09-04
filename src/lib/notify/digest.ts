import { prisma } from "@/lib/db";
import { log } from "@/lib/log";
import { sendMail, appUrl } from "@/lib/mail";
import { DIGEST_PREFERENCE_TYPE, NOTIFICATION_TYPE_LABELS, type NotificationType } from "./types";

/** D3's "one daily email instead of individual" escape valve — stored as a
 * sentinel NotificationPreference row rather than a new column, so it needs
 * no schema change: `channels` contains EMAIL when digest mode is on. */
export async function isDigestEnabled(userId: string): Promise<boolean> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId, type: DIGEST_PREFERENCE_TYPE } },
  });
  return Boolean(row?.channels.includes("EMAIL"));
}

/** Batch variant of `isDigestEnabled`, for filtering a bulk `notify()` call's
 * email recipients in one query instead of N. */
export async function digestEnabledUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds }, type: DIGEST_PREFERENCE_TYPE },
  });
  return new Set(rows.filter((r) => r.channels.includes("EMAIL")).map((r) => r.userId));
}

export async function setDigestEnabled(userId: string, on: boolean): Promise<void> {
  await prisma.notificationPreference.upsert({
    where: { userId_type: { userId, type: DIGEST_PREFERENCE_TYPE } },
    update: { channels: on ? ["EMAIL"] : [] },
    create: { userId, type: DIGEST_PREFERENCE_TYPE, channels: on ? ["EMAIL"] : [] },
  });
}

const DIGEST_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Once-daily rollup (worker/src/notify-tick.ts): every notification created
 * for a digest-enabled user in the last 24h, grouped by type and collapsed
 * into one email — regardless of how many individual notifications fired.
 */
export async function runDailyDigest(): Promise<{ sent: number }> {
  const prefs = await prisma.notificationPreference.findMany({
    where: { type: DIGEST_PREFERENCE_TYPE, channels: { has: "EMAIL" } },
    select: { userId: true },
  });
  if (prefs.length === 0) return { sent: 0 };

  const since = new Date(Date.now() - DIGEST_WINDOW_MS);
  let sent = 0;

  for (const { userId } of prefs) {
    try {
      const notifications = await prisma.notification.findMany({
        where: { userId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: { type: true, title: true, href: true },
      });
      if (notifications.length === 0) continue;

      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
      if (!user) continue;

      const byType = new Map<string, { title: string; href: string | null }[]>();
      for (const n of notifications) {
        const bucket = byType.get(n.type) ?? [];
        bucket.push({ title: n.title, href: n.href });
        byType.set(n.type, bucket);
      }

      const sections = Array.from(byType.entries())
        .map(([type, items]) => {
          const label = NOTIFICATION_TYPE_LABELS[type as NotificationType] ?? type;
          const rows = items
            .slice(0, 10)
            .map((it) => `<li>${it.href ? `<a href="${appUrl(it.href)}">${it.title}</a>` : it.title}</li>`)
            .join("");
          return `<h3 style="margin:16px 0 4px">${label} (${items.length})</h3><ul>${rows}</ul>`;
        })
        .join("");

      await sendMail({
        to: user.email,
        subject: `Your daily digest — ${notifications.length} update${notifications.length === 1 ? "" : "s"}`,
        text: notifications.map((n) => `- ${n.title}`).join("\n"),
        html: `<p>Hi ${user.name},</p>${sections}`,
      });
      sent++;
    } catch (err) {
      log.error("daily digest failed for user", { userId }, err);
    }
  }

  return { sent };
}
