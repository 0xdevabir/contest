/**
 * Winnowing (Schleimer, Wilkerson & Aiken, 2003) over a normalized token
 * stream — docs/phases/PHASE-10-integrity.md D1. Pure, deterministic,
 * DB-free: same inputs always produce the same fingerprint, which is what
 * lets the sweep search "did this appear anywhere, ever" via a plain index
 * lookup instead of re-comparing source text.
 *
 * k = 25 (k-gram length in tokens), w = 40 (window size in hashes) are the
 * doc's defaults: any shared substring of at least w+k-1 = 64 tokens is
 * guaranteed to be caught by at least one selected fingerprint.
 */
export const K_GRAM_SIZE = 25;
export const WINDOW_SIZE = 40;

export type PositionedHash = { hash: string; position: number };

/** djb2-xor over the joined k-gram — cheap, stable, and collisions here only
 * cost a slightly noisier candidate search (exact Jaccard re-checks anyway). */
function hashKGram(tokens: string[]): string {
  let h = 5381 >>> 0;
  const joined = tokens.join("");
  for (let i = 0; i < joined.length; i++) {
    h = ((h * 33) ^ joined.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Every k-gram's hash, with the token index it starts at. */
export function kgramHashes(tokens: string[], k = K_GRAM_SIZE): PositionedHash[] {
  if (tokens.length < k) return [];
  const out: PositionedHash[] = [];
  for (let i = 0; i <= tokens.length - k; i++) {
    out.push({ hash: hashKGram(tokens.slice(i, i + k)), position: i });
  }
  return out;
}

/**
 * Selects the minimum-hash k-gram per window of `w` (rightmost tie-break),
 * skipping a re-selection of the same position across overlapping windows.
 * Typically retains 3-5% of the input hashes.
 */
export function winnow(hashes: PositionedHash[], w = WINDOW_SIZE): PositionedHash[] {
  if (hashes.length === 0) return [];
  if (hashes.length <= w) {
    return [minOf(hashes)];
  }

  const selected: PositionedHash[] = [];
  let lastSelectedPosition = -1;

  for (let start = 0; start <= hashes.length - w; start++) {
    const window = hashes.slice(start, start + w);
    const min = minOf(window);
    if (min.position !== lastSelectedPosition) {
      selected.push(min);
      lastSelectedPosition = min.position;
    }
  }
  return selected;
}

/** Minimum by hash value (lexicographic on the hex string is fine since all
 * hashes are the same fixed width); rightmost on ties. */
function minOf(window: PositionedHash[]): PositionedHash {
  let best = window[0];
  for (let i = 1; i < window.length; i++) {
    if (window[i].hash <= best.hash) best = window[i];
  }
  return best;
}

/** End-to-end: normalized tokens -> winnowed fingerprint hashes, sorted for
 * stable storage/comparison. */
export function fingerprintTokens(tokens: string[], k = K_GRAM_SIZE, w = WINDOW_SIZE): string[] {
  const selected = winnow(kgramHashes(tokens, k), w);
  return [...new Set(selected.map((s) => s.hash))].sort();
}
