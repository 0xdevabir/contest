import { prisma } from "./db";
import { log } from "./log";

/** One earned freeze per 7-day streak, held cap 2 — PHASE-09's "why Duolingo's
 * streak mechanic works" note. A freeze silently absorbs exactly one missed
 * day so a single bad day doesn't erase weeks of a habit. */
const FREEZE_EARN_INTERVAL_DAYS = 7;
const MAX_FREEZES = 2;
const DEFAULT_TIMEZONE = "Asia/Dhaka";

/** "Day" for streak purposes is computed in the user's own timezone, not
 * UTC — PHASE-09's testing plan calls this out explicitly: a Dhaka (UTC+6)
 * student solving at 11pm must not lose their streak to a UTC day boundary. */
export function dayKey(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      date
    );
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE }).format(date);
  }
}

function daysBetween(dayKeyA: string, dayKeyB: string): number {
  const a = new Date(`${dayKeyA}T00:00:00Z`).getTime();
  const b = new Date(`${dayKeyB}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export type StreakUpdate = {
  current: number;
  longest: number;
  freezes: number;
  /** True if this solve advanced the streak (new day) vs. a repeat solve on
   * an already-counted day. */
  advanced: boolean;
  /** True if a held freeze absorbed a missed day this update. */
  usedFreeze: boolean;
};

/**
 * Records one AC toward the caller's streak. Idempotent within a single
 * day: solving five problems on the same day advances the streak once.
 * Never throws — a streak bug must not affect judging.
 */
export async function recordSolveForStreak(userId: string, solvedAt: Date = new Date()): Promise<StreakUpdate | null> {
  try {
    const existing = await prisma.userStreak.findUnique({ where: { userId } });
    const timezone = existing?.timezone ?? DEFAULT_TIMEZONE;
    const today = dayKey(solvedAt, timezone);

    if (!existing) {
      const created = await prisma.userStreak.create({
        data: { userId, current: 1, longest: 1, lastSolveDay: new Date(`${today}T00:00:00Z`), freezes: 0, timezone },
      });
      return { current: created.current, longest: created.longest, freezes: created.freezes, advanced: true, usedFreeze: false };
    }

    const lastDay = existing.lastSolveDay ? dayKey(existing.lastSolveDay, timezone) : null;
    if (lastDay === today) {
      return { current: existing.current, longest: existing.longest, freezes: existing.freezes, advanced: false, usedFreeze: false };
    }

    const gap = lastDay ? daysBetween(lastDay, today) : 1;
    let current = existing.current;
    let freezes = existing.freezes;
    let usedFreeze = false;

    if (gap === 1) {
      current += 1;
    } else if (gap === 2 && freezes > 0) {
      // Exactly one missed day, absorbed by a held freeze.
      current += 1;
      freezes -= 1;
      usedFreeze = true;
    } else {
      current = 1;
    }

    // Earn back a freeze every FREEZE_EARN_INTERVAL_DAYS of streak, capped.
    if (current > 0 && current % FREEZE_EARN_INTERVAL_DAYS === 0 && freezes < MAX_FREEZES) {
      freezes += 1;
    }

    const longest = Math.max(existing.longest, current);
    const updated = await prisma.userStreak.update({
      where: { userId },
      data: { current, longest, freezes, lastSolveDay: new Date(`${today}T00:00:00Z`) },
    });
    return { current: updated.current, longest: updated.longest, freezes: updated.freezes, advanced: true, usedFreeze };
  } catch (err) {
    log.error("streak update failed", { userId }, err);
    return null;
  }
}
