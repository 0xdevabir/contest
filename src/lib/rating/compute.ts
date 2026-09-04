import { prisma } from "../db";
import { log } from "../log";
import { notify } from "../notify";
import {
  DEFAULT_MU,
  DEFAULT_SIGMA,
  displayedRating,
  updateRatingsForContest,
  type ContestFieldEntry,
} from "./elo-mmr";
import type { ScoreboardRow } from "../scoring/types";

export const RATING_ENGINE_VERSION = 1;

/** D/Risks — "rating farming via self-organised contests": only PUBLIC
 * contests with a big enough official field are rated by default. Admins can
 * force-rate a smaller/other contest explicitly via the recompute endpoint. */
export const MIN_RATED_FIELD_SIZE = 20;

export type RatableStandings = { rows: { userId: string; rank: number }[] };

/**
 * Whether a contest should be rated at all — a PUBLIC contest with at least
 * `MIN_RATED_FIELD_SIZE` official participants in its final standings.
 * `force` bypasses both checks for an admin-triggered recompute.
 */
export function isRatable(
  contest: { visibility: string },
  officialCount: number,
  opts?: { force?: boolean }
): boolean {
  if (opts?.force) return true;
  return contest.visibility === "PUBLIC" && officialCount >= MIN_RATED_FIELD_SIZE;
}

/** Extracts (userId, rank) pairs from a stored standings snapshot payload,
 * skipping rows with no rank (unranked/virtual rows never make it into
 * `ScoreboardRow[]`, since snapshots only ever cover the official board). */
export function extractField(standings: unknown): { userId: string; rank: number }[] {
  const rows = (standings as { rows?: ScoreboardRow[] } | null)?.rows ?? [];
  return rows
    .filter((r) => r.userId && r.rank > 0)
    .map((r) => ({ userId: r.userId, rank: r.rank }));
}

/**
 * Applies one contest's final snapshot to every participant's rating,
 * writing one `RatingEvent` per participant and updating `UserRating`.
 * Idempotent per (userId, contestId) — `RatingEvent`'s unique constraint
 * means a duplicate call is a silent no-op via `skipDuplicates`.
 *
 * Contests must be applied in `endsAt` order across the whole history (the
 * caller's responsibility — see `recomputeAllRatings`), since each contest's
 * update depends on the (mu, sigma) state left by the previous one.
 */
export async function applyContestRating(
  contestId: string,
  opts?: { force?: boolean }
): Promise<{ rated: boolean; participants: number }> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { id: true, title: true, visibility: true, endsAt: true },
  });
  if (!contest) return { rated: false, participants: 0 };

  const already = await prisma.ratingEvent.findFirst({ where: { contestId }, select: { id: true } });
  if (already && !opts?.force) return { rated: false, participants: 0 };

  const snapshot = await prisma.contestStandingSnapshot.findFirst({
    where: { contestId, reason: "final" },
    orderBy: { version: "desc" },
  });
  if (!snapshot) return { rated: false, participants: 0 };

  const field = extractField(snapshot.standings);
  if (!isRatable(contest, field.length, opts)) return { rated: false, participants: 0 };

  // Deterministic tie-break: contest id, then user id — both already fixed
  // per call, so the only ordering freedom is within this array, sorted here.
  field.sort((a, b) => a.rank - b.rank || a.userId.localeCompare(b.userId));

  const priorRatings = await prisma.userRating.findMany({
    where: { userId: { in: field.map((f) => f.userId) } },
  });
  const priorByUser = new Map(priorRatings.map((r) => [r.userId, r]));

  const entries: ContestFieldEntry[] = field.map((f) => {
    const prior = priorByUser.get(f.userId);
    return {
      id: f.userId,
      rank: f.rank,
      prior: prior ? { mu: prior.mu, sigma: prior.sigma } : { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
    };
  });

  const results = updateRatingsForContest(entries);

  if (opts?.force) {
    await prisma.ratingEvent.deleteMany({ where: { contestId } });
  }

  await prisma.$transaction(async (tx) => {
    for (const r of results) {
      const before = priorByUser.get(r.id);
      const displayedBefore = before ? before.displayed : displayedRating({ mu: DEFAULT_MU, sigma: DEFAULT_SIGMA });
      const displayedAfter = displayedRating(r.after);
      const rank = field.find((f) => f.userId === r.id)!.rank;

      await tx.ratingEvent.create({
        data: {
          userId: r.id,
          contestId,
          snapshotId: snapshot.id,
          rank,
          ratedCount: field.length,
          muBefore: r.before.mu,
          sigmaBefore: r.before.sigma,
          muAfter: r.after.mu,
          sigmaAfter: r.after.sigma,
          displayedBefore,
          displayedAfter,
          delta: displayedAfter - displayedBefore,
          engineVersion: RATING_ENGINE_VERSION,
        },
      });

      await tx.userRating.upsert({
        where: { userId: r.id },
        create: {
          userId: r.id,
          mu: r.after.mu,
          sigma: r.after.sigma,
          displayed: displayedAfter,
          peak: displayedAfter,
          contests: 1,
          lastContestAt: contest.endsAt ?? new Date(),
          engineVersion: RATING_ENGINE_VERSION,
        },
        update: {
          mu: r.after.mu,
          sigma: r.after.sigma,
          displayed: displayedAfter,
          peak: Math.max(before?.peak ?? 0, displayedAfter),
          contests: { increment: 1 },
          lastContestAt: contest.endsAt ?? new Date(),
          engineVersion: RATING_ENGINE_VERSION,
        },
      });
    }
  });

  // Phase 11 — "rating changed" per participant. A per-user loop is fine
  // here (unlike the 500-registrant contest-start/contest-ended cases,
  // which batch): this runs once per contest off the worker tick, not on a
  // request path, and each user's delta/newRating text differs.
  for (const r of results) {
    const displayedAfter = displayedRating(r.after);
    const before = priorByUser.get(r.id);
    const displayedBefore = before ? before.displayed : displayedRating({ mu: DEFAULT_MU, sigma: DEFAULT_SIGMA });
    notify(r.id, "rating:changed", {
      delta: Math.round(displayedAfter - displayedBefore),
      newRating: Math.round(displayedAfter),
      contestTitle: contest.title,
    }).catch(() => undefined);
  }

  log.info("contest rated", { contestId, participants: results.length });
  return { rated: true, participants: results.length };
}

/**
 * Rates every un-rated finalized contest, in `endsAt` order (ties by contest
 * id) — the ordering the doc's determinism requirement depends on. Called
 * both from the post-finalize hook (one contest at a time, as it ends) and
 * from a full recompute (every contest, from scratch).
 */
export async function rateNewlyFinalizedContests(): Promise<{ rated: number; skipped: number }> {
  const candidates = await prisma.contest.findMany({
    where: {
      status: "ENDED",
      snapshots: { some: { reason: "final" } },
      ratingEvents: { none: {} },
    },
    select: { id: true, endsAt: true, createdAt: true },
  });
  candidates.sort(
    (a, b) => (a.endsAt ?? a.createdAt).getTime() - (b.endsAt ?? b.createdAt).getTime() || a.id.localeCompare(b.id)
  );

  let rated = 0;
  let skipped = 0;
  for (const c of candidates) {
    const result = await applyContestRating(c.id);
    if (result.rated) rated++;
    else skipped++;
  }
  return { rated, skipped };
}

/**
 * D1 — "must be recomputable from scratch and produce identical results".
 * Wipes every `RatingEvent`/`UserRating` and replays every rated contest's
 * final snapshot in `endsAt` order. This is both the repair tool for a
 * rating-engine bug and the determinism test's real-world counterpart.
 */
export async function recomputeAllRatings(): Promise<{ rated: number; skipped: number }> {
  const contests = await prisma.contest.findMany({
    where: { status: "ENDED", snapshots: { some: { reason: "final" } } },
    select: { id: true, endsAt: true, createdAt: true },
  });
  contests.sort(
    (a, b) => (a.endsAt ?? a.createdAt).getTime() - (b.endsAt ?? b.createdAt).getTime() || a.id.localeCompare(b.id)
  );

  await prisma.$transaction([prisma.ratingEvent.deleteMany({}), prisma.userRating.deleteMany({})]);

  // No `force` here: eligibility (PUBLIC + minimum field size) is
  // re-evaluated exactly as it was the first time, so a replay reproduces
  // the same set of rated contests, not "everything that ever finalized".
  let rated = 0;
  let skipped = 0;
  for (const c of contests) {
    const result = await applyContestRating(c.id);
    if (result.rated) rated++;
    else skipped++;
  }
  return { rated, skipped };
}
