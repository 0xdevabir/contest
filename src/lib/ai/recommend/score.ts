/**
 * D4 (docs/phases/PHASE-15-intelligence.md) — the recommender is a
 * deterministic scoring function; AI only writes the one-line explanation
 * (see ../features/recommend.ts). Pure and side-effect free so it is
 * directly unit-testable without a database — see score.test.ts.
 */

export type ScoreWeights = {
  difficultyFit: number;
  tagNeed: number;
  freshness: number;
  curriculumFit: number;
  repetition: number;
};

/** Tunable via A/B test per D4's testing plan; these are the starting values. */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  difficultyFit: 1,
  tagNeed: 1,
  freshness: 0.6,
  curriculumFit: 0.5,
  repetition: 0.8,
};

export type CandidateProblem = {
  id: string;
  /** ProblemRating.rating (Phase 9 D5); 1500 when unrated. */
  elo: number;
  /** ProblemTag rows: tagId + author-confidence weight (1-3). */
  tags: { tagId: string; weight: number }[];
};

export type AttemptState = {
  attempted: boolean;
  solved: boolean;
  lastAttemptAt: Date | null;
};

export type StudentContext = {
  /** UserRating.displayed (Phase 9 D1); 800 when unrated. */
  rating: number;
  /** tagId -> UserTagStat.mastery, in [0, 1]. Absent tag = mastery 0 (never attempted). */
  tagMastery: Map<string, number>;
  /** Tags the student's active course sections cover. Empty = no curriculum signal. */
  curriculumTagIds: Set<string>;
  /** Tag ids of the student's last few solved/attempted problems, most recent first. */
  recentTagIds: string[];
};

/**
 * Gaussian bump centered on `peakDelta` above the student's rating — this is
 * "difficulty fit peaks ~+100 Elo" from the testing plan. `sigma` controls
 * how quickly the fit falls off on either side.
 */
function difficultyFit(problemElo: number, studentRating: number, peakDelta = 100, sigma = 220): number {
  const delta = problemElo - studentRating;
  const z = (delta - peakDelta) / sigma;
  return Math.exp(-0.5 * z * z);
}

/** Weighted average of (1 - mastery) over the problem's tags — an unattempted
 * tag (no UserTagStat row) counts as mastery 0, i.e. maximum need. */
function tagNeed(problemTags: CandidateProblem["tags"], mastery: Map<string, number>): number {
  if (problemTags.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const t of problemTags) {
    const m = mastery.get(t.tagId) ?? 0;
    weightedSum += t.weight * (1 - m);
    weightTotal += t.weight;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/** 1 for never attempted; a recent unsolved attempt suppresses the score
 * (D4: "not recently failed"), decaying back to 1 over ~14 days. Already
 * solved is treated as fully "not fresh" — nothing to gain by recommending it. */
function freshness(attempt: AttemptState | undefined, now: Date): number {
  if (!attempt || !attempt.attempted) return 1;
  if (attempt.solved) return 0;
  if (!attempt.lastAttemptAt) return 1;
  const daysSince = (now.getTime() - attempt.lastAttemptAt.getTime()) / 86_400_000;
  const HALF_LIFE_DAYS = 5;
  return Math.min(1, 1 - Math.exp(-daysSince / HALF_LIFE_DAYS));
}

/** 1 if the problem touches a tag the student's curriculum covers, else 0.
 * No curriculum signal (self-paced practice) is neutral, not penalised. */
function curriculumFit(problemTags: CandidateProblem["tags"], curriculumTagIds: Set<string>): number {
  if (curriculumTagIds.size === 0) return 0.5;
  return problemTags.some((t) => curriculumTagIds.has(t.tagId)) ? 1 : 0;
}

/** Fraction of the recent streak window sharing a tag with this problem —
 * "vary the topic" / "no tag repeats 3x" from the testing plan. */
function repetition(problemTags: CandidateProblem["tags"], recentTagIds: string[], windowSize = 5): number {
  if (recentTagIds.length === 0) return 0;
  const problemTagIds = new Set(problemTags.map((t) => t.tagId));
  const window = recentTagIds.slice(0, windowSize);
  const matches = window.filter((tagId) => problemTagIds.has(tagId)).length;
  return matches / window.length;
}

export type ScoreBreakdown = {
  total: number;
  difficultyFit: number;
  tagNeed: number;
  freshness: number;
  curriculumFit: number;
  repetition: number;
};

export function scoreProblem(
  problem: CandidateProblem,
  student: StudentContext,
  attempt: AttemptState | undefined,
  now: Date = new Date(),
  weights: ScoreWeights = DEFAULT_WEIGHTS
): ScoreBreakdown {
  const df = difficultyFit(problem.elo, student.rating);
  const tn = tagNeed(problem.tags, student.tagMastery);
  const fr = freshness(attempt, now);
  const cf = curriculumFit(problem.tags, student.curriculumTagIds);
  const rp = repetition(problem.tags, student.recentTagIds);

  const total =
    weights.difficultyFit * df +
    weights.tagNeed * tn +
    weights.freshness * fr +
    weights.curriculumFit * cf -
    weights.repetition * rp;

  return { total, difficultyFit: df, tagNeed: tn, freshness: fr, curriculumFit: cf, repetition: rp };
}

/** Ranks candidates highest score first, breaking ties by problem id for
 * determinism (tests and repeat runs must be stable). */
export function rankCandidates(
  problems: CandidateProblem[],
  student: StudentContext,
  attempts: Map<string, AttemptState>,
  now: Date = new Date(),
  weights: ScoreWeights = DEFAULT_WEIGHTS
): { problemId: string; score: ScoreBreakdown }[] {
  return problems
    .map((p) => ({ problemId: p.id, score: scoreProblem(p, student, attempts.get(p.id), now, weights) }))
    .sort((a, b) => b.score.total - a.score.total || a.problemId.localeCompare(b.problemId));
}
