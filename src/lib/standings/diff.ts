import type { ScoreboardRow } from "../scoring/types";
import type { StandingsDiffPayload, StandingsDiffRow } from "./channel";

export function toDiffRow(row: ScoreboardRow): StandingsDiffRow {
  return { rank: row.rank, id: row.userId, solved: row.solved, penalty: row.penalty, points: row.points, cells: row.cells };
}

function sameRow(a: StandingsDiffRow, b: StandingsDiffRow): boolean {
  return (
    a.rank === b.rank &&
    a.solved === b.solved &&
    a.penalty === b.penalty &&
    a.points === b.points &&
    JSON.stringify(a.cells) === JSON.stringify(b.cells)
  );
}

/**
 * D2 — row-level diff between two standings versions. A 500-row board is
 * ~80 KB of JSON; pushing only the rows that actually moved keeps an SSE
 * push a few hundred bytes regardless of board size.
 */
export function diffStandings(previous: ScoreboardRow[] | null, next: ScoreboardRow[], version: number): StandingsDiffPayload {
  const prevById = new Map((previous ?? []).map((r) => [r.userId, toDiffRow(r)]));
  const nextIds = new Set(next.map((r) => r.userId));

  const changed: StandingsDiffRow[] = [];
  for (const row of next) {
    const diffRow = toDiffRow(row);
    const prevRow = prevById.get(row.userId);
    if (!prevRow || !sameRow(prevRow, diffRow)) changed.push(diffRow);
  }

  const removed = previous ? previous.filter((r) => !nextIds.has(r.userId)).map((r) => r.userId) : [];

  return { version, changed, removed };
}
