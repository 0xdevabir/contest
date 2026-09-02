/**
 * BullMQ priority for the "judge" queue — lower runs first. Mirrors D3's
 * table in docs/phases/DONE__PHASE-04-judge-queue.md exactly.
 */
export const JUDGE_PRIORITY = {
  CONTEST_LIVE: 0,
  ASSIGNMENT_DEADLINE: 5,
  PRACTICE_AUTHENTICATED: 10,
  REJUDGE: 15,
  ANONYMOUS: 20,
} as const;

export type PriorityContext = {
  /** Submission is against a currently-LIVE contest. */
  contestLive?: boolean;
  /** Submission is against a time-boxed assignment (reserved for Phase 6+). */
  hasDeadline?: boolean;
  authenticated?: boolean;
  /** Part of a rejudge batch — always deprioritised, never at a user's expense. */
  rejudge?: boolean;
};

export function priorityFor(ctx: PriorityContext): number {
  if (ctx.rejudge) return JUDGE_PRIORITY.REJUDGE;
  if (ctx.contestLive) return JUDGE_PRIORITY.CONTEST_LIVE;
  if (ctx.hasDeadline) return JUDGE_PRIORITY.ASSIGNMENT_DEADLINE;
  if (!ctx.authenticated) return JUDGE_PRIORITY.ANONYMOUS;
  return JUDGE_PRIORITY.PRACTICE_AUTHENTICATED;
}
