import type { NotificationChannel } from "@prisma/client";

/**
 * D3's notification-type registry (docs/phases/PHASE-11-community.md). Each
 * type owns its default channel set and how to render a title/body/href
 * from its payload — the only place that knowledge lives. Adding a
 * notification type means adding one entry here plus the `notify()` call
 * site; nothing else needs to know about channels or copy.
 */
export type NotificationType =
  | "contest:starting"
  | "contest:ended"
  | "rating:changed"
  | "assignment:dueSoon"
  | "assignment:graded"
  | "clarification:answered"
  | "comment:reply"
  | "comment:mention"
  | "class:announcement"
  | "badge:earned"
  | "teacher:approved";

export type NotifyPayload = Record<string, string | number | boolean | null | undefined>;

export type NotificationTypeDef = {
  /** Default channel set — overridden per-user by a NotificationPreference row. */
  defaultChannels: NotificationChannel[];
  title: (payload: NotifyPayload) => string;
  body: (payload: NotifyPayload) => string;
  href: (payload: NotifyPayload) => string | null;
};

const ALL: NotificationChannel[] = ["INAPP", "EMAIL", "PUSH"];
const INAPP_PUSH: NotificationChannel[] = ["INAPP", "PUSH"];
const INAPP_ONLY: NotificationChannel[] = ["INAPP"];
const INAPP_EMAIL: NotificationChannel[] = ["INAPP", "EMAIL"];

export const NOTIFICATION_TYPES: Record<NotificationType, NotificationTypeDef> = {
  "contest:starting": {
    defaultChannels: ALL,
    title: (p) => `${p.contestTitle} starts in an hour`,
    body: () => "Get your setup ready — the contest opens soon.",
    href: (p) => (p.contestSlug ? `/contests/${p.contestSlug}` : null),
  },
  "contest:ended": {
    defaultChannels: INAPP_PUSH,
    title: (p) => `${p.contestTitle} has ended`,
    body: () => "Final standings are ready.",
    href: (p) => (p.contestSlug ? `/contests/${p.contestSlug}/standings` : null),
  },
  "rating:changed": {
    defaultChannels: INAPP_PUSH,
    title: (p) => {
      const delta = Number(p.delta ?? 0);
      const sign = delta >= 0 ? "+" : "";
      return `Your rating changed ${sign}${delta}`;
    },
    body: (p) => `New rating: ${p.newRating} (from ${p.contestTitle}).`,
    href: () => "/profile",
  },
  "assignment:dueSoon": {
    defaultChannels: ALL,
    title: (p) => `${p.assignmentTitle} is due soon`,
    body: () => "Due within 24 hours.",
    href: (p) => (p.sectionId && p.assignmentId ? `/courses/${p.sectionId}/assignments/${p.assignmentId}` : null),
  },
  "assignment:graded": {
    defaultChannels: INAPP_ONLY,
    title: (p) => `${p.assignmentTitle ?? "An assignment"} was graded`,
    body: (p) => (p.points != null ? `You scored ${p.points} points.` : "Your grade is ready."),
    href: (p) => (p.sectionId && p.assignmentId ? `/courses/${p.sectionId}/assignments/${p.assignmentId}` : null),
  },
  "clarification:answered": {
    defaultChannels: INAPP_PUSH,
    title: (p) => `Your question about ${p.contestTitle} was answered`,
    body: (p) => String(p.answer ?? ""),
    href: (p) => (p.contestSlug ? `/contests/${p.contestSlug}` : null),
  },
  "comment:reply": {
    defaultChannels: INAPP_ONLY,
    title: (p) => `${p.authorName} replied to your comment`,
    body: (p) => String(p.excerpt ?? ""),
    href: (p) => (typeof p.href === "string" ? p.href : null),
  },
  "comment:mention": {
    defaultChannels: INAPP_ONLY,
    title: (p) => `${p.authorName} mentioned you`,
    body: (p) => String(p.excerpt ?? ""),
    href: (p) => (typeof p.href === "string" ? p.href : null),
  },
  "class:announcement": {
    defaultChannels: ALL,
    title: (p) => String(p.title ?? "Announcement"),
    body: (p) => String(p.excerpt ?? ""),
    href: (p) => (typeof p.href === "string" ? p.href : null),
  },
  "badge:earned": {
    defaultChannels: INAPP_ONLY,
    title: (p) => `Badge earned: ${p.badgeName}`,
    body: () => "Check your profile to see it.",
    href: () => "/profile",
  },
  "teacher:approved": {
    defaultChannels: INAPP_EMAIL,
    title: () => "Your teacher account was approved",
    body: () => "You can now create contests and problems.",
    href: () => "/teacher",
  },
};

/** Every user-facing type — used to render the preference matrix. Excludes
 * the internal `_digest` sentinel type (see src/lib/notify/digest.ts). */
export const NOTIFICATION_TYPE_LIST = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  "contest:starting": "Contest starting in 1 h (registered)",
  "contest:ended": "Contest ended, results ready",
  "rating:changed": "Rating changed",
  "assignment:dueSoon": "Assignment due in 24 h",
  "assignment:graded": "Assignment graded",
  "clarification:answered": "Clarification answered",
  "comment:reply": "Reply to my comment",
  "comment:mention": "@mention",
  "class:announcement": "Class announcement",
  "badge:earned": "Badge earned",
  "teacher:approved": "Teacher approved",
};

/** Sentinel `NotificationPreference.type` used solely to store the "one
 * digest email instead of individual" opt-in (D3) — never a real
 * notification type, never passed to `notify()`. */
export const DIGEST_PREFERENCE_TYPE = "_digest";
