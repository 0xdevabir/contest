/**
 * Standard competition ranking ("1224" ranking): rows with an identical
 * `sameRank` share a rank, and the next distinct rank skips ahead by the
 * number of tied rows. `sortCompare` may break ties further (e.g. by name)
 * purely for a deterministic display order — that extra tiebreak must NOT
 * feed into `sameRank`, or genuinely-tied competitors would get split ranks.
 *
 * Sorts `rows` in place and mutates each row's `rank`, matching the inline
 * loop every scoring path used before this was extracted.
 */
export function assignRanks<T extends { rank: number }>(
  rows: T[],
  sortCompare: (a: T, b: T) => number,
  sameRank: (a: T, b: T) => boolean
): T[] {
  rows.sort(sortCompare);
  let rank = 0;
  let prev: T | null = null;
  rows.forEach((row, i) => {
    if (!prev || !sameRank(prev, row)) rank = i + 1;
    row.rank = rank;
    prev = row;
  });
  return rows;
}
