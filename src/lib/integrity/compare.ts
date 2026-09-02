/**
 * Similarity scoring against a per-problem population baseline —
 * docs/phases/PHASE-10-integrity.md D2. Pure: takes hash sets/lists in,
 * returns numbers/regions out. No DB access, no I/O.
 */

export type Region = { aStart: number; aEnd: number; bStart: number; bEnd: number };

/** Jaccard similarity of two fingerprint hash sets. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const h of setA) if (setB.has(h)) shared++;
  const union = setA.size + setB.size - shared;
  return union === 0 ? 0 : shared / union;
}

export function sharedCount(a: readonly string[], b: readonly string[]): number {
  const setB = new Set(b);
  let shared = 0;
  for (const h of a) if (setB.has(h)) shared++;
  return shared;
}

/** Median of a numeric array. Empty input -> 0. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Median absolute deviation — a robust spread estimate that isn't blown up
 * by the handful of near-identical trivial solutions every easy problem has. */
export function mad(values: number[]): number {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/**
 * z-score of `similarity` against a problem's own similarity distribution,
 * using MAD (scaled by 1.4826 to be consistent with a normal stddev) instead
 * of raw stddev so a handful of identical-trivial-solution pairs don't
 * flatten the whole scale. MAD of 0 (every pair in the population is
 * identical, e.g. a two-line problem) falls back to raw stddev to avoid a
 * division by zero producing an artificially huge z.
 */
export function zScore(similarity: number, population: number[]): number {
  const m = median(population);
  const madValue = mad(population) * 1.4826;
  if (madValue > 1e-9) return (similarity - m) / madValue;

  const mean = population.length ? population.reduce((s, v) => s + v, 0) / population.length : 0;
  const variance = population.length
    ? population.reduce((s, v) => s + (v - mean) ** 2, 0) / population.length
    : 0;
  const stddev = Math.sqrt(variance);
  return stddev > 1e-9 ? (similarity - mean) / stddev : 0;
}

/**
 * Hashes present in more than `thresholdRatio` of a problem's fingerprints
 * (starter code, a standard fast-IO template) — excluded from scoring per D2.
 */
export function boilerplateHashes(
  allFingerprints: readonly string[][],
  thresholdRatio = 0.2
): Set<string> {
  const counts = new Map<string, number>();
  for (const fp of allFingerprints) {
    for (const h of new Set(fp)) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const threshold = thresholdRatio * allFingerprints.length;
  const boilerplate = new Set<string>();
  for (const [h, count] of counts) if (count > threshold) boilerplate.add(h);
  return boilerplate;
}

export function excludeHashes(fingerprint: readonly string[], exclude: Set<string>): string[] {
  return fingerprint.filter((h) => !exclude.has(h));
}

/**
 * Groups shared positions between two fingerprints' positioned hashes into
 * contiguous aligned regions for the side-by-side view. Two-pointer merge
 * over sorted (hash, position) lists — no external diff library (none is
 * installed in this repo); a gap of more than `maxGap` k-grams between
 * consecutive shared hashes starts a new region.
 */
export function alignRegions(
  a: { hash: string; position: number }[],
  b: { hash: string; position: number }[],
  maxGap = 5
): Region[] {
  const bByHash = new Map<string, number[]>();
  for (const { hash, position } of b) {
    const arr = bByHash.get(hash);
    if (arr) arr.push(position);
    else bByHash.set(hash, [position]);
  }

  type Pair = { aPos: number; bPos: number };
  const pairs: Pair[] = [];
  for (const { hash, position } of a) {
    const candidates = bByHash.get(hash);
    if (!candidates) continue;
    for (const bPos of candidates) pairs.push({ aPos: position, bPos });
  }
  pairs.sort((x, y) => x.aPos - y.aPos || x.bPos - y.bPos);

  const regions: Region[] = [];
  let current: Region | null = null;
  for (const { aPos, bPos } of pairs) {
    if (
      current &&
      aPos - current.aEnd <= maxGap &&
      Math.abs(bPos - current.bEnd - (aPos - current.aEnd)) <= maxGap
    ) {
      current.aEnd = aPos;
      current.bEnd = bPos;
    } else {
      if (current) regions.push(current);
      current = { aStart: aPos, aEnd: aPos, bStart: bPos, bEnd: bPos };
    }
  }
  if (current) regions.push(current);
  return regions;
}
