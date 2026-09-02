import type { Verdict } from "@prisma/client";
import { prisma } from "../db";
import { DEFAULT_MU } from "./elo-mmr";

/**
 * D5 — problem difficulty inferred from solve data. Each (user, problem)
 * first attempt is treated as a one-on-one match between the user's rating
 * and the problem's: solving on the first try means the problem "loses" to
 * the user, repeated failures mean it "gains". This is a lightweight
 * one-sided Elo update (K-factor style), not full Elo-MMR — a problem has no
 * "sigma" and only ever plays the same match shape (one user vs. itself).
 */
const K_FACTOR = 32;
const LOGISTIC_SCALE = 400 / Math.LN10;
/** Confidence approaches 1 as solve volume grows; chosen so ~30 solves gets
 * you to roughly 0.6, ~100 to roughly 0.85 — enough to caption "Community:"
 * without a wall of low-signal numbers on day one. */
const CONFIDENCE_HALF_LIFE = 40;

function expectedScore(userRating: number, problemRating: number): number {
  return 1 / (1 + Math.exp(-(userRating - problemRating) / LOGISTIC_SCALE));
}

function confidenceFor(solvedCount: number): number {
  return 1 - Math.exp(-solvedCount / CONFIDENCE_HALF_LIFE);
}

/**
 * Called once per (user, problem) *first* judged attempt while `ratings` is
 * on (src/lib/submission-effects.ts). A user's displayed rating (or 1500 if
 * they have none yet) stands in for their skill; the problem's rating moves
 * against it exactly like a two-player Elo match.
 */
export async function recordProblemRatingAttempt(opts: {
  problemId: string;
  userId: string;
  verdict: Verdict;
}): Promise<void> {
  if (opts.verdict === "SKIP" || opts.verdict === "PENDING" || opts.verdict === "JUDGING") return;

  // Only the first attempt on this problem by this user counts as a match —
  // later attempts on the same problem are the same "game" continuing, not
  // a new one, so use SolvedProblem/Submission history to detect "first".
  const priorAttempts = await prisma.submission.count({
    where: { userId: opts.userId, problemId: opts.problemId },
  });
  // priorAttempts includes the current submission (already persisted with
  // its final verdict by the time this runs), so "first attempt" means
  // exactly one row exists.
  if (priorAttempts !== 1) return;

  const [userRating, problem] = await Promise.all([
    prisma.userRating.findUnique({ where: { userId: opts.userId }, select: { displayed: true } }),
    prisma.problemRating.findUnique({ where: { problemId: opts.problemId } }),
  ]);

  const userSkill = userRating?.displayed ?? DEFAULT_MU;
  const priorRating = problem?.rating ?? DEFAULT_MU;
  const solvedCount = problem?.solvedCount ?? 0;

  // Score is from the *problem's* perspective: it "wins" (gains rating) when
  // the user fails, "loses" when the user solves on the first try.
  const actualForProblem = opts.verdict === "AC" ? 0 : 1;
  const expectedForProblem = 1 - expectedScore(userSkill, priorRating);
  const nextRating = Math.round(priorRating + K_FACTOR * (actualForProblem - expectedForProblem));
  const nextSolvedCount = solvedCount + (opts.verdict === "AC" ? 1 : 0);

  await prisma.problemRating.upsert({
    where: { problemId: opts.problemId },
    create: {
      problemId: opts.problemId,
      rating: nextRating,
      confidence: confidenceFor(nextSolvedCount),
      solvedCount: nextSolvedCount,
    },
    update: {
      rating: nextRating,
      confidence: confidenceFor(nextSolvedCount),
      solvedCount: nextSolvedCount,
    },
  });
}

/**
 * Batch recompute over full historical solve data, iterating first attempts
 * in `createdAt` order until convergence (bounded to a handful of passes —
 * each pass just replays `recordProblemRatingAttempt`'s logic in order, so
 * "convergence" here means the ratings stop moving meaningfully between
 * passes rather than a closed-form fixed point).
 */
export async function recomputeAllProblemRatings(opts?: { passes?: number }): Promise<{ problems: number; passes: number }> {
  const passes = opts?.passes ?? 3;

  const firstAttempts = await prisma.submission.findMany({
    where: { problemRefId: { not: null } },
    orderBy: { createdAt: "asc" },
    distinct: ["userId", "problemRefId"],
    select: { userId: true, problemRefId: true, verdict: true },
  });

  await prisma.problemRating.deleteMany({});

  const ratings = new Map<string, { rating: number; solvedCount: number }>();
  const userSkills = new Map<string, number>(
    (await prisma.userRating.findMany({ select: { userId: true, displayed: true } })).map((u) => [u.userId, u.displayed])
  );

  for (let pass = 0; pass < passes; pass++) {
    for (const attempt of firstAttempts) {
      if (!attempt.userId || !attempt.problemRefId) continue;
      const current = ratings.get(attempt.problemRefId) ?? { rating: DEFAULT_MU, solvedCount: 0 };
      const userSkill = userSkills.get(attempt.userId) ?? DEFAULT_MU;
      const actualForProblem = attempt.verdict === "AC" ? 0 : 1;
      const expectedForProblem = 1 - expectedScore(userSkill, current.rating);
      current.rating = Math.round(current.rating + K_FACTOR * (actualForProblem - expectedForProblem));
      if (pass === passes - 1 && attempt.verdict === "AC") current.solvedCount += 1;
      ratings.set(attempt.problemRefId, current);
    }
  }

  for (const [problemId, r] of ratings) {
    await prisma.problemRating.upsert({
      where: { problemId },
      create: { problemId, rating: r.rating, confidence: confidenceFor(r.solvedCount), solvedCount: r.solvedCount },
      update: { rating: r.rating, confidence: confidenceFor(r.solvedCount), solvedCount: r.solvedCount },
    });
  }

  return { problems: ratings.size, passes };
}
