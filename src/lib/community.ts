import { prisma } from "./db";
import type { Actor } from "./authz";
import { getProblemRef } from "./problems";
import { isProblemInLiveContest } from "./live-contest-problems";

export type SpoilerGate = { visible: boolean; reason?: string };

/** `problemId` here is always the string slug (Problem.slug / the id used in
 * problem URLs), matching the convention SolvedProblem/Submission already use. */
export async function hasSolved(userId: string, problemId: string): Promise<boolean> {
  const row = await prisma.solvedProblem.findUnique({
    where: { userId_problemId: { userId, problemId } },
  });
  return Boolean(row);
}

/**
 * D1's "the viewer is staff" exemption: a global admin, or an approved
 * teacher who either authored the problem or is staffing a currently-LIVE
 * contest that contains it.
 */
export async function isCommunityStaff(actor: Actor, problemId: string): Promise<boolean> {
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;
  if (actor.role !== "TEACHER" || !actor.teacherApprovedAt) return false;

  const ref = await getProblemRef(problemId).catch(() => null);
  if (!ref) return false;

  const problem = await prisma.problem.findUnique({ where: { id: ref.problemId }, select: { authorId: true } });
  if (problem?.authorId === actor.id) return true;

  const staffRow = await prisma.contestStaff.findFirst({
    where: { userId: actor.id, contest: { status: "LIVE", problems: { some: { problemId } } } },
    select: { id: true },
  });
  return Boolean(staffRow);
}

const LIVE_REASON = "This content is hidden while the problem is part of a live contest.";

/**
 * D1's editorial/spoiler-comment rule: staff always see it; during a live
 * contest containing the problem, everyone else is blocked outright;
 * otherwise it's visible once solved, or after an explicit "reveal" click
 * with a warning shown by the caller's UI.
 */
async function gateSpoilerContent(actor: Actor, problemId: string, explicitReveal: boolean): Promise<SpoilerGate> {
  if (actor && (await isCommunityStaff(actor, problemId))) return { visible: true };

  if (await isProblemInLiveContest(problemId)) {
    return { visible: false, reason: LIVE_REASON };
  }

  if (actor && (await hasSolved(actor.id, problemId))) return { visible: true };
  if (explicitReveal) return { visible: true };

  return { visible: false, reason: "Solve the problem, or explicitly reveal it, to view this." };
}

export async function canViewEditorial(actor: Actor, problemId: string, explicitReveal: boolean): Promise<SpoilerGate> {
  return gateSpoilerContent(actor, problemId, explicitReveal);
}

export async function canViewSpoilerComment(actor: Actor, problemId: string, explicitReveal: boolean): Promise<SpoilerGate> {
  return gateSpoilerContent(actor, problemId, explicitReveal);
}

/**
 * D1's shared-solutions rule: solving is the bar for everyone, including
 * staff ("no reveal button... solving first is the right bar") — except
 * during a live contest containing the problem, where it tightens to staff
 * only, overriding even a solver's access.
 */
export async function canViewSharedSolutions(actor: Actor, problemId: string): Promise<SpoilerGate> {
  if (await isProblemInLiveContest(problemId)) {
    if (actor && (await isCommunityStaff(actor, problemId))) return { visible: true };
    return { visible: false, reason: LIVE_REASON };
  }

  if (actor && (await hasSolved(actor.id, problemId))) return { visible: true };
  return { visible: false, reason: "Solve this problem to view shared solutions." };
}
