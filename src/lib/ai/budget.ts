import { prisma } from "../db";
import { RateLimitError } from "../errors";

/**
 * D2 (docs/phases/PHASE-15-intelligence.md) — "a per-institution monthly
 * token cap, enforced before the call... a runaway loop must hit a wall,
 * not a bill." `checkBudget` must be called (and must pass) before any
 * anthropic.messages.* call is made; `recordUsage` is called after, with
 * the real cost from the response's usage block.
 */

const DEFAULT_MONTHLY_CENTS = 2000;

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function currentBudget(institutionId: string, now: Date) {
  const budget = await prisma.aiBudget.upsert({
    where: { institutionId },
    create: { institutionId, monthlyCents: DEFAULT_MONTHLY_CENTS, usedCents: 0, periodStart: monthStart(now) },
    update: {},
  });

  // Roll over into a fresh period rather than accumulating forever — a
  // budget row created last semester should not still be "used up" now.
  if (budget.periodStart.getTime() < monthStart(now).getTime()) {
    return prisma.aiBudget.update({
      where: { institutionId },
      data: { usedCents: 0, periodStart: monthStart(now) },
    });
  }
  return budget;
}

/**
 * Throws RateLimitError (mapped to 429) when the institution's monthly cap
 * is exhausted and `hardStop` is set. Institution-less callers (no
 * institution on the actor, e.g. a public-account teacher) are unmetered —
 * there is nothing to cap against; that gap is closed at the
 * flags/onboarding layer, not here.
 */
export async function checkBudget(institutionId: string | null, now: Date = new Date()): Promise<void> {
  if (!institutionId) return;
  const budget = await currentBudget(institutionId, now);
  if (budget.hardStop && budget.usedCents >= budget.monthlyCents) {
    throw new RateLimitError(24 * 60 * 60, "This institution's monthly AI budget has been reached.");
  }
}

export async function recordUsage(institutionId: string | null, costCents: number, now: Date = new Date()): Promise<void> {
  if (!institutionId || costCents <= 0) return;
  await currentBudget(institutionId, now);
  await prisma.aiBudget.update({
    where: { institutionId },
    data: { usedCents: { increment: costCents } },
  });
}
