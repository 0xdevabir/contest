import type { Verdict } from "@prisma/client";
import { prisma } from "./db";
import { log } from "./log";
import { recordProblemAttempt } from "./problem-stats";
import { markStandingsDirty } from "./standings/live";
import { awardBalloonIfEligible } from "./balloons";
import { isEnabled } from "./flags";
import { recordSolveForStreak } from "./streaks";
import { evaluateSubmissionJudgedBadges } from "./badges";
import { recordProblemRatingAttempt } from "./rating/problem-rating";
import { fingerprintSubmission } from "./integrity/fingerprint";

/**
 * Post-judge side effects shared by the synchronous judge path
 * (src/app/api/judge/route.ts, when `judgeQueue` is off or Redis is down)
 * and the async worker path (worker/src/index.ts) — solved-problem tracking
 * and the problem stats rollup. Must be called after the Submission row for
 * this attempt already reflects its final verdict, and must never throw: a
 * side-effect failure should never surface as a failed submission.
 */
export async function applyJudgedSideEffects(opts: {
  userId: string;
  problemId: string;
  contestId?: string | null;
  verdict: Verdict;
  problemRefId?: string | null;
  /** Phase 10 — present only when the caller has the freshly-judged
   * submission's id/source/language at hand; fingerprinting is skipped
   * (not retried) when absent, e.g. a rejudge's verdict-only update. */
  submissionId?: string;
  code?: string;
  language?: string;
}): Promise<void> {
  // Phase 10 — academic integrity. Fingerprinting must never block or delay
  // the rest of judging's side effects, so it's fired without awaiting the
  // others and wrapped in its own guard.
  if (opts.submissionId && opts.code && opts.language && (await isEnabled("integrity"))) {
    fingerprintSubmission({
      submissionId: opts.submissionId,
      problemId: opts.problemId,
      code: opts.code,
      language: opts.language,
    }).catch((err) => log.warn("fingerprint dispatch failed", { submissionId: opts.submissionId, error: err instanceof Error ? err.message : String(err) }));
  }

  try {
    if (opts.verdict === "AC" && !opts.contestId) {
      await prisma.solvedProblem.upsert({
        where: { userId_problemId: { userId: opts.userId, problemId: opts.problemId } },
        update: { solveCount: { increment: 1 }, problemRefId: opts.problemRefId ?? undefined },
        create: { userId: opts.userId, problemId: opts.problemId, problemRefId: opts.problemRefId ?? null },
      });
    }
  } catch (err) {
    log.error("solved-problem upsert failed", { problemId: opts.problemId }, err);
  }

  if (opts.problemRefId) {
    await recordProblemAttempt({ problemId: opts.problemRefId, userId: opts.userId, verdict: opts.verdict });
  }

  // Phase 9 — gamification. Guarded by the `ratings` flag so an off switch
  // fully disables the feature's writes, not just its UI (per the doc's
  // rollback note: "ratings off ... skips post-contest rating jobs").
  if (await isEnabled("ratings")) {
    const now = new Date();
    try {
      if (opts.verdict === "AC") await recordSolveForStreak(opts.userId, now);
    } catch (err) {
      log.warn("streak update failed", { userId: opts.userId, error: err instanceof Error ? err.message : String(err) });
    }
    try {
      await evaluateSubmissionJudgedBadges({
        userId: opts.userId,
        problemId: opts.problemId,
        problemRefId: opts.problemRefId,
        verdict: opts.verdict,
        createdAt: now,
      });
    } catch (err) {
      log.warn("badge evaluation failed", { userId: opts.userId, error: err instanceof Error ? err.message : String(err) });
    }
    if (opts.problemRefId) {
      try {
        await recordProblemRatingAttempt({ problemId: opts.problemRefId, userId: opts.userId, verdict: opts.verdict });
      } catch (err) {
        log.warn("problem rating update failed", { problemId: opts.problemRefId, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  // Phase 7 (docs/phases/PHASE-07-live-contest.md D2): every judged
  // contest submission marks the board dirty; the standings tick drains
  // this on a fixed cadence, which is the debounce itself.
  if (opts.contestId) {
    try {
      await markStandingsDirty(opts.contestId);
    } catch (err) {
      log.warn("marking standings dirty failed", { contestId: opts.contestId, error: err instanceof Error ? err.message : String(err) });
    }
    try {
      await awardBalloonIfEligible({ contestId: opts.contestId, userId: opts.userId, problemId: opts.problemId, verdict: opts.verdict });
    } catch (err) {
      log.warn("balloon award failed", { contestId: opts.contestId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
