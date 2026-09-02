import type { Verdict } from "@prisma/client";
import { prisma } from "./db";
import { log } from "./log";
import { tierFor } from "./rating/tiers";
import type { ScoreboardRow } from "./scoring/types";
import { issueMilestoneCertificateIfDue } from "./certificate-issuance";

/**
 * Declarative badge rules (PHASE-09 "Badge engine"). Adding a badge is a
 * `Badge` row with one of these shapes in `rule` — never new code. Each
 * variant is evaluated by exactly one of the three triggers below.
 */
export type BadgeRule =
  | { type: "solve_count"; threshold: number }
  | { type: "streak"; days: number }
  | { type: "contest_rank"; max: number; minField: number }
  | { type: "rating_tier"; tier: string }
  | { type: "tag_mastery"; tagSlug: string; solved: number }
  | { type: "first_ac_of_problem" }
  | { type: "night_owl"; hourRange: [number, number]; count: number }
  | { type: "comeback"; attempts: number };

function parseRule(raw: unknown): BadgeRule | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as BadgeRule;
}

/**
 * Idempotent award: `UserBadge`'s composite primary key means a duplicate
 * insert is just a constraint violation, which we swallow — "a duplicate
 * award is a no-op" per the acceptance criteria.
 */
async function award(
  userId: string,
  badgeId: string,
  context: Record<string, string | number | boolean | null> = {}
): Promise<boolean> {
  try {
    await prisma.userBadge.create({ data: { userId, badgeId, context } });
    return true;
  } catch (err) {
    // P2002 = unique constraint violation, i.e. already earned. Anything
    // else is a real failure and should be visible.
    const code = (err as { code?: string } | null)?.code;
    if (code !== "P2002") log.error("badge award failed", { userId, badgeId }, err);
    return false;
  }
}

/** Cheap, per-submission checks — run inline from the judge path so a badge
 * can appear the moment it's earned. Only ever called for an AC verdict. */
export async function evaluateSubmissionJudgedBadges(opts: {
  userId: string;
  problemId: string;
  problemRefId?: string | null;
  verdict: Verdict;
  createdAt: Date;
}): Promise<void> {
  if (opts.verdict !== "AC") return;

  const cheapTypes = new Set(["solve_count", "first_ac_of_problem", "night_owl", "comeback"]);
  const allBadges = await prisma.badge.findMany();
  const badges = allBadges.filter((b) => cheapTypes.has((parseRule(b.rule)?.type ?? "") as string));
  if (badges.length === 0) return;

  const solvedCount = await prisma.solvedProblem.count({ where: { userId: opts.userId } }).catch(() => 0);

  for (const badge of badges) {
    const rule = parseRule(badge.rule);
    if (!rule) continue;

    try {
      if (rule.type === "solve_count" && solvedCount >= rule.threshold) {
        await award(opts.userId, badge.id, { solvedCount });
        await issueMilestoneCertificateIfDue(opts.userId, solvedCount);
      } else if (rule.type === "first_ac_of_problem" && opts.problemRefId) {
        const priorAc = await prisma.submission.count({
          where: { problemRefId: opts.problemRefId, verdict: "AC", createdAt: { lt: opts.createdAt } },
        });
        if (priorAc === 0) await award(opts.userId, badge.id, { problemId: opts.problemId });
      } else if (rule.type === "night_owl") {
        const [startHour, endHour] = rule.hourRange;
        const nightSolves = await prisma.$queryRaw<{ count: bigint }[]>`
          SELECT count(*)::bigint AS count FROM "Submission"
          WHERE "userId" = ${opts.userId} AND "verdict" = 'AC'
            AND EXTRACT(HOUR FROM "createdAt") >= ${startHour} AND EXTRACT(HOUR FROM "createdAt") < ${endHour}
        `;
        const count = Number(nightSolves[0]?.count ?? 0);
        if (count >= rule.count) await award(opts.userId, badge.id, { count });
      } else if (rule.type === "comeback") {
        const failedBefore = await prisma.submission.count({
          where: {
            userId: opts.userId,
            problemId: opts.problemId,
            verdict: { not: "AC" },
            createdAt: { lt: opts.createdAt },
          },
        });
        if (failedBefore >= rule.attempts) await award(opts.userId, badge.id, { attempts: failedBefore });
      }
    } catch (err) {
      log.error("badge rule evaluation failed", { badgeId: badge.id, rule: rule.type }, err);
    }
  }
}

/** Contest-rank badges, evaluated once off a contest's final snapshot. */
export async function evaluateContestEndedBadges(contestId: string): Promise<void> {
  const badges = await prisma.badge.findMany({ where: { rule: { path: ["type"], equals: "contest_rank" } } });
  if (badges.length === 0) return;

  const snapshot = await prisma.contestStandingSnapshot.findFirst({
    where: { contestId, reason: "final" },
    orderBy: { version: "desc" },
  });
  if (!snapshot) return;

  const rows = ((snapshot.standings as { rows?: ScoreboardRow[] } | null)?.rows ?? []).filter((r) => r.userId);
  const fieldSize = rows.length;

  for (const badge of badges) {
    const rule = parseRule(badge.rule);
    if (!rule || rule.type !== "contest_rank") continue;
    if (fieldSize < rule.minField) continue;
    for (const row of rows) {
      if (row.rank <= rule.max) {
        await award(row.userId, badge.id, { contestId, rank: row.rank, fieldSize });
      }
    }
  }
}

/** Streak, rating-tier, and tag-mastery badges — aggregate rules that are
 * cheap to run once nightly but wasteful per-submission. */
export async function evaluateNightlyBadges(): Promise<{ awarded: number }> {
  let awarded = 0;

  const streakBadges = await prisma.badge.findMany({ where: { rule: { path: ["type"], equals: "streak" } } });
  if (streakBadges.length > 0) {
    const streaks = await prisma.userStreak.findMany({ select: { userId: true, current: true } });
    for (const badge of streakBadges) {
      const rule = parseRule(badge.rule);
      if (!rule || rule.type !== "streak") continue;
      for (const s of streaks) {
        if (s.current >= rule.days && (await award(s.userId, badge.id, { days: s.current }))) awarded++;
      }
    }
  }

  const tierBadges = await prisma.badge.findMany({ where: { rule: { path: ["type"], equals: "rating_tier" } } });
  if (tierBadges.length > 0) {
    const ratings = await prisma.userRating.findMany({ select: { userId: true, displayed: true } });
    for (const badge of tierBadges) {
      const rule = parseRule(badge.rule);
      if (!rule || rule.type !== "rating_tier") continue;
      for (const r of ratings) {
        if (tierFor(r.displayed).key === rule.tier && (await award(r.userId, badge.id, { rating: r.displayed }))) awarded++;
      }
    }
  }

  const masteryBadges = await prisma.badge.findMany({ where: { rule: { path: ["type"], equals: "tag_mastery" } } });
  if (masteryBadges.length > 0) {
    for (const badge of masteryBadges) {
      const rule = parseRule(badge.rule);
      if (!rule || rule.type !== "tag_mastery") continue;
      const tag = await prisma.tag.findUnique({ where: { slug: rule.tagSlug }, select: { id: true } });
      if (!tag) continue;
      const stats = await prisma.userTagStat.findMany({
        where: { tagId: tag.id, solved: { gte: rule.solved } },
        select: { userId: true, solved: true },
      });
      for (const stat of stats) {
        if (await award(stat.userId, badge.id, { solved: stat.solved })) awarded++;
      }
    }
  }

  return { awarded };
}
