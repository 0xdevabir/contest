import type { Verdict } from "@prisma/client";
import { prisma } from "./db";

/**
 * Physical-contest balloon queue (docs/phases/PHASE-07-live-contest.md
 * scope). Fires once per (participation, problem) — the upsert on the
 * unique constraint makes a re-solve (or a re-judge landing on AC again) a
 * no-op rather than a duplicate queue entry. Only problems with a
 * `balloonColor` set (`ContestProblem.balloonColor`) queue a balloon at all;
 * most contests leave it null and get none.
 *
 * Team contests get exactly one balloon per team regardless of which
 * member's account actually solved it — it's always filed under the
 * captain's participation, so the runner-facing queue has one row per team
 * per problem instead of one per teammate who happened to submit.
 */
export async function awardBalloonIfEligible(opts: {
  contestId: string;
  userId: string;
  problemId: string;
  verdict: Verdict;
}): Promise<void> {
  if (opts.verdict !== "AC") return;

  const contestProblem = await prisma.contestProblem.findUnique({
    where: { contestId_problemId: { contestId: opts.contestId, problemId: opts.problemId } },
    select: { balloonColor: true },
  });
  if (!contestProblem?.balloonColor) return;

  const participation = await prisma.contestParticipation.findUnique({
    where: { contestId_userId_mode: { contestId: opts.contestId, userId: opts.userId, mode: "LIVE" } },
    select: { id: true, teamId: true },
  });
  if (!participation) return;

  let participationId = participation.id;
  if (participation.teamId) {
    const team = await prisma.team.findUnique({ where: { id: participation.teamId }, select: { captainId: true } });
    const captainParticipation = team
      ? await prisma.contestParticipation.findUnique({
          where: { contestId_userId_mode: { contestId: opts.contestId, userId: team.captainId, mode: "LIVE" } },
          select: { id: true },
        })
      : null;
    if (captainParticipation) participationId = captainParticipation.id;
  }

  await prisma.balloon.upsert({
    where: { participationId_problemId: { participationId, problemId: opts.problemId } },
    update: {},
    create: {
      contestId: opts.contestId,
      participationId,
      problemId: opts.problemId,
      color: contestProblem.balloonColor,
    },
  });
}
