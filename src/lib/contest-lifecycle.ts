import { prisma } from "./db";
import { log } from "./log";
import { parseRules } from "./contests";
import { buildContestDashboard, mergeRowsByTeam, teamMembershipMap } from "./contest-dashboard";
import { getProblem } from "./problems";
import { isEnabled } from "./flags";
import { applyContestRating } from "./rating/compute";
import { evaluateContestEndedBadges } from "./badges";
import { issueContestCertificates } from "./certificate-issuance";

/**
 * Move contests out of LIVE once their window has passed.
 *
 * Nothing else does this — the admin "End" button is the only writer of ENDED —
 * so without it an expired contest stays LIVE forever and disappears from both
 * the live list and the archive. Public contest reads call this first so the
 * stored status matches reality for standings, admin views, and submissions.
 *
 * This is deliberately cheap (one `updateMany`) and safe to call from a
 * request path. The heavier freeze/drain/snapshot side effects below run on
 * `worker/src/contest-tick.ts`'s interval instead, since draining the judge
 * queue can take up to two minutes and must never block a page load.
 */
export async function closeExpiredContests(): Promise<number> {
  try {
    const { count } = await prisma.contest.updateMany({
      where: { status: "LIVE", endsAt: { lt: new Date() } },
      data: { status: "ENDED" },
    });
    return count;
  } catch (err) {
    console.error("closing expired contests failed", err);
    return 0;
  }
}

/** `SCHEDULED -> LIVE` once `startsAt` arrives — the other half of
 * `closeExpiredContests()`'s cheap status flip, called from the worker tick
 * (unlike the LIVE->ENDED direction, nothing reads this on every request, so
 * it isn't also wired into the page-load path). */
export async function promoteScheduledContests(): Promise<number> {
  try {
    const { count } = await prisma.contest.updateMany({
      where: { status: "SCHEDULED", startsAt: { lte: new Date() } },
      data: { status: "LIVE" },
    });
    return count;
  } catch (err) {
    log.error("promoting scheduled contests failed", {}, err);
    return 0;
  }
}

/** `endsAt - freezeMinutes`, or null if the contest has no freeze window. */
export function computeFreezeAt(endsAt: Date | null, rawRules: unknown): Date | null {
  if (!endsAt) return null;
  const rules = parseRules(rawRules as never);
  if (rules.freezeMinutes <= 0) return null;
  return new Date(endsAt.getTime() - rules.freezeMinutes * 60_000);
}

/**
 * Writes the next `ContestStandingSnapshot` version for a contest — the
 * complete ranked standings as JSON, computed via the same scoring engines
 * the live dashboard uses (docs/phases/PHASE-05-contest-engine.md D4).
 * Never overwrites a prior version.
 */
export async function snapshotContest(
  contestId: string,
  reason: "final" | "freeze" | "rejudge" | "manual",
  opts: { createdById?: string; partial?: boolean } = {}
): Promise<void> {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) return;

  const [registrations, contestProblems, submissions] = await Promise.all([
    prisma.contestRegistration.findMany({
      where: { contestId },
      select: {
        userId: true,
        user: { select: { name: true, institutionId: true, institution: { select: { shortName: true } } } },
      },
    }),
    prisma.contestProblem.findMany({
      where: { contestId },
      orderBy: { order: "asc" },
      select: { problemId: true, label: true, points: true },
    }),
    prisma.submission.findMany({
      where: { contestId },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true, problemId: true, verdict: true, createdAt: true, score: true },
    }),
  ]);

  const problemMeta = new Map(
    await Promise.all(
      contestProblems.map(async (p) => {
        const meta = await getProblem(p.problemId);
        return [p.problemId, { title: meta?.title ?? p.problemId, difficulty: meta?.difficulty ?? null, topic: meta?.topic ?? null }] as const;
      })
    )
  );

  let dashboard = buildContestDashboard({
    registrations,
    contestProblems,
    submissions,
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
    rules: contest.rules,
    createdAt: contest.createdAt,
    problemMeta,
    // A snapshot is the public/official board — no single viewer's frozen
    // exemption applies to it.
    viewerId: null,
    now: reason === "freeze" ? computeFreezeAt(contest.endsAt, contest.rules)?.getTime() : contest.endsAt?.getTime(),
  });

  const parsedRules = parseRules(contest.rules);
  if (parsedRules.teamSize > 1) {
    const teamOf = await teamMembershipMap(contestId);
    if (teamOf.size > 0) dashboard = mergeRowsByTeam(dashboard, teamOf, parsedRules.penaltyPerWrong);
  }

  const last = await prisma.contestStandingSnapshot.findFirst({
    where: { contestId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  await prisma.contestStandingSnapshot.create({
    data: {
      contestId,
      version,
      reason,
      standings: { ...dashboard, partial: opts.partial ?? false } as never,
      problemStats: dashboard.problems as never,
      participantCount: registrations.length,
      createdById: opts.createdById,
    },
  });
  await prisma.contest.update({ where: { id: contestId }, data: { participantCount: registrations.length } });
}

/** Snapshots every LIVE contest whose freeze window has just begun and that
 * hasn't been frozen yet. Called from the worker tick, once a minute. */
export async function freezeDueContests(): Promise<number> {
  const now = new Date();
  const candidates = await prisma.contest.findMany({
    where: { status: "LIVE", endsAt: { not: null } },
    select: { id: true, endsAt: true, rules: true },
  });

  let frozen = 0;
  for (const contest of candidates) {
    const freezeAt = computeFreezeAt(contest.endsAt, contest.rules);
    if (!freezeAt || freezeAt.getTime() > now.getTime()) continue;

    const existing = await prisma.contestStandingSnapshot.findFirst({
      where: { contestId: contest.id, reason: "freeze" },
      select: { id: true },
    });
    if (existing) continue;

    await snapshotContest(contest.id, "freeze");
    frozen++;
  }
  return frozen;
}

const DRAIN_TIMEOUT_MS = 120_000;
const DRAIN_POLL_MS = 3_000;

/** Polls until no submission for this contest is still QUEUED/JUDGING, up to
 * a 120s cap. A submission sent in the final second is still in flight when
 * the clock hits zero — ending without waiting produces a final board that
 * changes 20 seconds later. Returns false (and lets the caller mark the
 * snapshot partial) if the cap is hit first. */
async function drainContestQueue(contestId: string): Promise<boolean> {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  for (;;) {
    const inFlight = await prisma.submission.count({
      where: { contestId, state: { in: ["QUEUED", "JUDGING"] } },
    });
    if (inFlight === 0) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
  }
}

/** Finalizes every contest whose `endsAt` has passed and that has no
 * `"final"` snapshot yet — draining the judge queue first, per the doc's
 * "drain before snapshot" requirement. Ensures `status: ENDED` regardless of
 * whether `closeExpiredContests()` already flipped it. */
export async function drainAndFinalizeContests(): Promise<number> {
  const now = new Date();
  const candidates = await prisma.contest.findMany({
    where: { endsAt: { lte: now }, status: { in: ["LIVE", "ENDED"] } },
    select: { id: true },
  });

  let finalized = 0;
  for (const contest of candidates) {
    const existing = await prisma.contestStandingSnapshot.findFirst({
      where: { contestId: contest.id, reason: "final" },
      select: { id: true },
    });
    if (existing) continue;

    const drained = await drainContestQueue(contest.id);
    if (!drained) {
      log.warn("contest queue drain timed out — snapshotting as partial", { contestId: contest.id });
    }
    await prisma.contest.update({ where: { id: contest.id }, data: { status: "ENDED" } });
    await snapshotContest(contest.id, "final", { partial: !drained });

    // Phase 9 — rate the field and award contest-rank badges off the final
    // snapshot. Never lets a rating/badge bug block finalization: both are
    // additive and fully recomputable, so a failure here is logged and
    // picked up by the next tick or an admin recompute, not retried inline.
    if (await isEnabled("ratings")) {
      try {
        await applyContestRating(contest.id);
      } catch (err) {
        log.error("post-finalize rating failed", { contestId: contest.id }, err);
      }
      try {
        await evaluateContestEndedBadges(contest.id);
      } catch (err) {
        log.error("post-finalize badge evaluation failed", { contestId: contest.id }, err);
      }
      try {
        await issueContestCertificates(contest.id);
      } catch (err) {
        log.error("post-finalize certificate issuance failed", { contestId: contest.id }, err);
      }
    }

    finalized++;
  }
  return finalized;
}

/** One tick of the contest lifecycle scheduler (worker/src/contest-tick.ts),
 * run once a minute per docs/phases/PHASE-05-contest-engine.md. */
export async function runContestLifecycleTick(): Promise<{ promoted: number; frozen: number; finalized: number }> {
  const promoted = await promoteScheduledContests();
  const frozen = await freezeDueContests();
  const finalized = await drainAndFinalizeContests();
  return { promoted, frozen, finalized };
}
