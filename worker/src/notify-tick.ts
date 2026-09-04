import { prisma } from "@/lib/db";
import { isEnabled } from "@/lib/flags";
import { log } from "@/lib/log";
import { notify } from "@/lib/notify";
import { runDailyDigest } from "@/lib/notify/digest";
import { alreadySent, markSent } from "@/lib/notify/dedupe";

/**
 * D3's "contest starting in 1 h" reminder and D3's daily digest, run on an
 * interval like the other worker ticks (worker/src/ratings-tick.ts). Both
 * use a Redis-backed dedupe key so re-running every tick doesn't spam —
 * see src/lib/notify/dedupe.ts.
 */
const TICK_INTERVAL_MS = Number(process.env.NOTIFY_TICK_INTERVAL_MS ?? 5 * 60_000); // 5m default

async function notifyContestsStartingSoon(): Promise<number> {
  const now = new Date();
  const soon = new Date(now.getTime() + 60 * 60_000);
  const contests = await prisma.contest.findMany({
    where: { status: "SCHEDULED", startsAt: { gte: now, lte: soon } },
    select: { id: true, title: true, slug: true },
  });

  let notified = 0;
  for (const contest of contests) {
    const key = `notify:contest-start-sent:${contest.id}`;
    if (await alreadySent(key)) continue;

    const registrations = await prisma.contestRegistration.findMany({
      where: { contestId: contest.id },
      select: { userId: true },
    });
    if (registrations.length === 0) {
      await markSent(key, 2 * 60 * 60);
      continue;
    }

    await notify(
      registrations.map((r) => r.userId),
      "contest:starting",
      { contestTitle: contest.title, contestSlug: contest.slug }
    );
    await markSent(key, 2 * 60 * 60);
    notified += registrations.length;
  }
  return notified;
}

/** "Assignment due in 24 h" (D3) — mirrors the due-soon count already
 * computed inline in src/app/layout.tsx for the nav badge, but as a
 * one-time-per-assignment notification rather than a live count. */
async function notifyAssignmentsDueSoon(): Promise<number> {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60_000);
  const assignments = await prisma.assignment.findMany({
    where: { published: true, dueAt: { gte: now, lte: soon } },
    select: { id: true, title: true, sectionId: true },
  });

  let notified = 0;
  for (const assignment of assignments) {
    const key = `notify:assignment-due-sent:${assignment.id}`;
    if (await alreadySent(key)) continue;

    const enrollments = await prisma.enrollment.findMany({
      where: { sectionId: assignment.sectionId, status: "ACTIVE", userId: { not: null } },
      select: { userId: true },
    });
    const userIds = enrollments.map((e) => e.userId).filter((id): id is string => id !== null);
    if (userIds.length === 0) {
      await markSent(key, 25 * 60 * 60);
      continue;
    }

    await notify(userIds, "assignment:dueSoon", {
      assignmentTitle: assignment.title,
      sectionId: assignment.sectionId,
      assignmentId: assignment.id,
    });
    await markSent(key, 25 * 60 * 60);
    notified += userIds.length;
  }
  return notified;
}

async function tick(): Promise<void> {
  try {
    if (!(await isEnabled("community"))) return;

    const startingSoon = await notifyContestsStartingSoon();
    const assignmentsDue = await isEnabled("classroom").then((on) => (on ? notifyAssignmentsDueSoon() : 0));

    const digestKey = `notify:digest:${new Date().toISOString().slice(0, 10)}`;
    let digest = { sent: 0 };
    if (!(await alreadySent(digestKey))) {
      digest = await runDailyDigest();
      await markSent(digestKey, 25 * 60 * 60);
    }

    if (startingSoon || assignmentsDue || digest.sent) {
      log.info("notify tick", { startingSoon, assignmentsDue, digestSent: digest.sent });
    }
  } catch (err) {
    log.error("notify tick failed", {}, err);
  }
}

async function main(): Promise<void> {
  log.info("notify scheduler started", { intervalMs: TICK_INTERVAL_MS });
  await tick();
  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);

  const shutdown = () => {
    log.info("notify scheduler shutting down", {});
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("notify scheduler crashed on startup", {}, err);
  process.exit(1);
});
