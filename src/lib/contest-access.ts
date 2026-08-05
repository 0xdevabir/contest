import type { ContestPhase } from "./contests";

export function contestProblemHref({
  phase,
  registered,
  contestId,
  problemId,
}: {
  phase: ContestPhase;
  registered: boolean;
  contestId: string;
  problemId: string;
}): string | null {
  if (phase === "ENDED") return `/problems/${problemId}`;
  if (phase === "RUNNING" && registered) {
    return `/problems/${problemId}?contest=${contestId}`;
  }
  return null;
}

export function contestSubmissionError({
  contestOpen,
  contestEnded,
  problemIncluded,
  registered,
}: {
  contestOpen: boolean;
  contestEnded: boolean;
  problemIncluded: boolean;
  registered: boolean;
}): string | null {
  if (!contestOpen) {
    return contestEnded
      ? "This contest has ended — reopen the problem from the past contest to practise."
      : "Contest is not live";
  }
  if (!problemIncluded) return "This problem is not part of the contest";
  if (!registered) return "Register for the contest first";
  return null;
}
