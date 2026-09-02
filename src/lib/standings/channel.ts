import type { ScoreboardRow } from "../scoring/types";

/**
 * D2 (docs/phases/PHASE-07-live-contest.md) — one multiplexed pub/sub
 * channel per contest carries all three live event kinds so a connected
 * client holds exactly one stream, not three.
 */
export function contestEventsChannel(contestId: string): string {
  return `contest:${contestId}:events`;
}

export function standingsPayloadKey(contestId: string): string {
  return `standings:${contestId}:payload`;
}

export function standingsRankKey(contestId: string): string {
  return `standings:${contestId}:rank`;
}

/** Set of contestIds with a pending recompute — the debounce queue itself. */
export const STANDINGS_DIRTY_SET = "standings:dirty-contests";

export type StandingsDiffRow = { rank: number; id: string; solved: number; penalty: number; points: number; cells: ScoreboardRow["cells"] };

export type StandingsDiffPayload = {
  version: number;
  changed: StandingsDiffRow[];
  /** Ids present in the previous version but absent from this one (left the board). */
  removed: string[];
};

export type ContestLiveEvent =
  | { event: "standings"; data: StandingsDiffPayload }
  | { event: "announcement"; data: { id: string; title: string; body: string; problemId: string | null; createdAt: string } }
  | { event: "clarification"; data: { id: string; status: string; userId: string; answer?: string | null } };
