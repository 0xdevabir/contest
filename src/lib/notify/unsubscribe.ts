import { createHmac } from "crypto";
import type { NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/mail";
import { NOTIFICATION_TYPES, type NotificationType } from "./types";

function secret(): string {
  return process.env.NOTIFY_UNSUB_SECRET || "dev-notify-unsub-secret";
}

function b64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input)).toString("base64url");
}

/**
 * Every unsubscribe email link is a signed, no-login-required token (D4):
 * "sets the preference rather than blacklisting the address — so a user who
 * unsubscribes from contest reminders still gets their grade notification."
 */
export function buildUnsubscribeUrl(userId: string, type: string): string {
  const payload = b64url(JSON.stringify({ userId, type }));
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest());
  return appUrl(`/api/notifications/unsubscribe?token=${payload}.${sig}`);
}

export function verifyUnsubscribeToken(token: string): { userId: string; type: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = b64url(createHmac("sha256", secret()).update(payload).digest());
  if (expected !== sig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed?.userId !== "string" || typeof parsed?.type !== "string") return null;
    return { userId: parsed.userId, type: parsed.type };
  } catch {
    return null;
  }
}

/** Removes EMAIL from this user's channel set for `type`, leaving every
 * other type (and every other channel of this one) untouched. */
export async function unsubscribeFromEmail(userId: string, type: string): Promise<void> {
  const existing = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId, type } },
  });
  const current: NotificationChannel[] =
    existing?.channels ?? NOTIFICATION_TYPES[type as NotificationType]?.defaultChannels ?? ["INAPP"];
  const next = current.filter((c) => c !== "EMAIL");

  await prisma.notificationPreference.upsert({
    where: { userId_type: { userId, type } },
    update: { channels: next },
    create: { userId, type, channels: next },
  });
}
