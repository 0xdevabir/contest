/**
 * Elo-MMR (Aram Ebtekar & Paul Liu, 2021) — a rating system for n-way contest
 * rankings, in the Codeforces family. docs/phases/PHASE-09-ratings-leaderboards.md
 * D1 has the design rationale; this is the ~200-line reference algorithm.
 *
 * Determinism is a hard requirement (D1): the same set of contests, processed
 * in the same order, must always produce the same ratings, so a bug found
 * months later can be repaired by a full replay. That means:
 *   - no `Math.random`, no wall-clock reads inside the maths
 *   - iteration order is always the caller-supplied array order
 *   - only the operations below (add/multiply/divide/log/exp), which are
 *     deterministic per the IEEE 754 spec on any conforming runtime
 */

/** A player's skill estimate and uncertainty, in internal Elo-MMR units. */
export type SkillState = {
  mu: number;
  sigma: number;
};

export const DEFAULT_MU = 1500;
export const DEFAULT_SIGMA = 350;

/** Per-contest uncertainty growth applied before every contest — skill
 * drifts over time, so a long-idle player's rating should move more
 * readily than a currently-active one's. */
const SIGMA_DRIFT_PER_CONTEST = 30;
/** Sigma never drops below this — a player is never treated as fully solved. */
const SIGMA_FLOOR = 60;
/** Sigma is clamped above this so one wild outlier contest can't blow it up. */
const SIGMA_CEILING = 400;

/** Logistic-regression scale, i.e. Codeforces' 400-points-per-decade-of-odds
 * convention: a 400-point gap corresponds to roughly a 10:1 win probability. */
const LOGISTIC_SCALE = 400 / Math.LN10;

/** Displayed rating is deliberately conservative for a new/uncertain player
 * so one lucky contest can't be gamed into a high public rating. */
const DISPLAY_SIGMA_MULTIPLIER = 2;
const DISPLAY_FLOOR = 400;

export function displayedRating(state: SkillState): number {
  return Math.max(DISPLAY_FLOOR, Math.round(state.mu - DISPLAY_SIGMA_MULTIPLIER * state.sigma));
}

/** One contest's input: an ordered field, best rank first (rank 1 = winner),
 * ties sharing a rank. `priorSkills[i]` corresponds to `ranks[i]`. */
export type ContestFieldEntry = {
  id: string;
  rank: number;
  prior: SkillState;
};

export type RatingUpdateResult = {
  id: string;
  before: SkillState;
  after: SkillState;
};

/** Standard logistic CDF centered at `center`, scaled by `LOGISTIC_SCALE`. */
function logisticCdf(x: number, center: number): number {
  return 1 / (1 + Math.exp(-(x - center) / LOGISTIC_SCALE));
}

/**
 * Computes the "performance" rating implied by a rank against the field:
 * the value `p` for which the player's expected rank (sum of win
 * probabilities against every opponent) matches their actual rank.
 *
 * Solved by binary search over `p` — the expected-rank function is
 * monotonic in `p`, so this converges to a stable fixed point regardless of
 * field composition (Elo-MMR §3). Fixed iteration count keeps it
 * deterministic and bounded-cost.
 */
function performanceRating(entry: ContestFieldEntry, field: ContestFieldEntry[]): number {
  // The search range must be shared across the whole field (not centered on
  // this entry's own prior) — otherwise two players in the same contest
  // solve over different windows and an underdog's win over a much
  // higher-rated field silently gets clipped to a narrower range than the
  // favorite's, understating exactly the outcome Elo-MMR is meant to reward.
  const priors = field.map((e) => e.prior.mu);
  let lo = Math.min(...priors) - 1000;
  let hi = Math.max(...priors) + 1000;

  // Expected rank if this player's rating were `p`: 1 + sum over opponents of
  // P(opponent beats this player). Lower rank number = better performance,
  // so this is monotonically increasing in `p`... inverted: we want the `p`
  // that reproduces `entry.rank`.
  const expectedRank = (p: number): number => {
    let sum = 1; // you always "beat" yourself, i.e. count your own rank slot
    for (const opp of field) {
      if (opp.id === entry.id) continue;
      // Probability the opponent ranks better (lower number) than this
      // player, i.e. the opponent's implied performance beats `p`.
      sum += 1 - logisticCdf(p, opp.prior.mu);
    }
    return sum;
  };

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (expectedRank(mid) > entry.rank) {
      // Too low an expected rank number means this player is performing
      // too well for `mid` — the true `p` performing at `entry.rank` must
      // be higher.
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** Bayesian update: pull `(mu, sigma)` toward the performance estimate,
 * weighted by the ratio of measurement noise to prior uncertainty — a
 * confident (low-sigma) player moves less per contest than a new one. */
function bayesianUpdate(prior: SkillState, performance: number): SkillState {
  // Treat the round's performance as a noisy observation with variance
  // LOGISTIC_SCALE^2 (the logistic's characteristic scale). Standard
  // conjugate-Gaussian update.
  const priorVar = prior.sigma * prior.sigma;
  const obsVar = LOGISTIC_SCALE * LOGISTIC_SCALE;
  const posteriorVar = 1 / (1 / priorVar + 1 / obsVar);
  const mu = posteriorVar * (prior.mu / priorVar + performance / obsVar);
  const sigma = Math.sqrt(posteriorVar);
  return { mu, sigma: Math.min(SIGMA_CEILING, Math.max(SIGMA_FLOOR, sigma)) };
}

/**
 * Runs one contest's rating update over its full field.
 *
 * `field` must be in a stable, deterministic order (caller's responsibility —
 * src/lib/rating/compute.ts sorts by contest id then user id for ties).
 * Returns one result per input entry, same order as input.
 */
export function updateRatingsForContest(field: ContestFieldEntry[]): RatingUpdateResult[] {
  // Drift sigma up-front for everyone, modelling "skill may have changed
  // since your last contest" before this contest's evidence is applied.
  const drifted: ContestFieldEntry[] = field.map((e) => ({
    ...e,
    prior: {
      mu: e.prior.mu,
      sigma: Math.min(SIGMA_CEILING, Math.sqrt(e.prior.sigma * e.prior.sigma + SIGMA_DRIFT_PER_CONTEST * SIGMA_DRIFT_PER_CONTEST)),
    },
  }));

  return drifted.map((entry) => {
    const performance = performanceRating(entry, drifted);
    const after = bayesianUpdate(entry.prior, performance);
    return { id: entry.id, before: entry.prior, after };
  });
}
