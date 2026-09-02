import type { Verdict } from "@prisma/client";
import { prisma } from "./db";
import { log } from "./log";

/**
 * Rollup after every judged submission against a real Problem row. Cheap
 * incremental upserts rather than a full recompute — called from the judge
 * route's persistSubmission path *after* the Submission row for this attempt
 * has been inserted (so the counts below include it), so it must never throw
 * (a stats-write failure must not fail the submission itself).
 */
export async function recordProblemAttempt(opts: {
  problemId: string;
  userId: string;
  verdict: Verdict;
}): Promise<void> {
  try {
    const attemptsByUser = await prisma.submission.count({
      where: { problemRefId: opts.problemId, userId: opts.userId },
    });
    const acsByUser =
      opts.verdict === "AC"
        ? await prisma.submission.count({
            where: { problemRefId: opts.problemId, userId: opts.userId, verdict: "AC" },
          })
        : 0;
    const isFirstAttemptByUser = attemptsByUser === 1;
    const isFirstAcByUser = opts.verdict === "AC" && acsByUser === 1;

    await prisma.problemStats.upsert({
      where: { problemId: opts.problemId },
      create: {
        problemId: opts.problemId,
        attempts: 1,
        accepted: opts.verdict === "AC" ? 1 : 0,
        distinctUsers: 1,
        distinctSolvers: opts.verdict === "AC" ? 1 : 0,
      },
      update: {
        attempts: { increment: 1 },
        accepted: opts.verdict === "AC" ? { increment: 1 } : undefined,
        distinctUsers: isFirstAttemptByUser ? { increment: 1 } : undefined,
        distinctSolvers: isFirstAcByUser ? { increment: 1 } : undefined,
      },
    });
  } catch (err) {
    log.error("problem stats rollup failed", { problemId: opts.problemId }, err);
  }
}
