/**
 * D5 (docs/phases/PHASE-15-intelligence.md) — the hint bot's post-filter.
 * Prompting alone is insufficient, so every hint response is mechanically
 * checked before it reaches a student: no fenced code block below level 3,
 * and no long run of tokens lifted from the reference solution at any
 * level. This is enforcement layer 3 of 4 (system prompt, self-declared
 * `level` field, this filter, and the contest/assignment lockout in
 * src/lib/ai/features/hint.ts).
 */

const FENCED_CODE_BLOCK = /```[\s\S]*?```/;
const INDENTED_CODE_RUN = /(^|\n)(?: {4}|\t)[^\n]+(\n(?: {4}|\t)[^\n]+){2,}/;

export function containsCodeBlock(text: string): boolean {
  return FENCED_CODE_BLOCK.test(text) || INDENTED_CODE_RUN.test(text);
}

/** Lowercase word/operator tokens — good enough to catch a pasted solution
 * without being thrown off by whitespace/formatting differences. */
function tokenize(source: string): string[] {
  return source
    .toLowerCase()
    .match(/[a-z0-9_]+|[^\sa-z0-9_]/g) ?? [];
}

/**
 * Longest run of consecutive tokens shared between `text` and
 * `referenceSource`, via a token-level LCS-of-consecutive-runs scan. O(n*m)
 * on token counts, which are small (a hint is a few sentences; a reference
 * solution is a few hundred tokens) — fine for a per-request filter.
 */
export function longestSharedTokenRun(text: string, referenceSource: string): number {
  const a = tokenize(text);
  const b = tokenize(referenceSource);
  if (a.length === 0 || b.length === 0) return 0;

  const bIndex = new Map<string, number[]>();
  b.forEach((tok, i) => {
    const list = bIndex.get(tok);
    if (list) list.push(i);
    else bIndex.set(tok, [i]);
  });

  let prev = new Array<number>(b.length).fill(0);
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    const curr = new Array<number>(b.length).fill(0);
    const positions = bIndex.get(a[i]);
    if (positions) {
      for (const j of positions) {
        curr[j] = (j > 0 ? prev[j - 1] : 0) + 1;
        if (curr[j] > best) best = curr[j];
      }
    }
    prev = curr;
  }
  return best;
}

export type HintLevel = 1 | 2 | 3;

export type HintGuardrailInput = {
  requestedLevel: HintLevel;
  /** The level the model's structured output self-declared. */
  declaredLevel: number;
  text: string;
  referenceSource: string;
  /** A run longer than this many shared tokens is treated as a leaked solution. */
  maxSharedTokens?: number;
};

export type HintGuardrailResult = { ok: true } | { ok: false; reason: string };

/**
 * The single gate hint.ts calls before ever showing a response to a
 * student. Order matters for the reason message but not for correctness —
 * any one failure rejects the whole response.
 */
export function reviewHintResponse(input: HintGuardrailInput): HintGuardrailResult {
  const maxSharedTokens = input.maxSharedTokens ?? 12;

  if (input.declaredLevel !== input.requestedLevel) {
    return { ok: false, reason: `Model declared level ${input.declaredLevel}, requested ${input.requestedLevel}.` };
  }
  if (input.requestedLevel < 3 && containsCodeBlock(input.text)) {
    return { ok: false, reason: `Level ${input.requestedLevel} hint contains a code block.` };
  }
  const sharedRun = longestSharedTokenRun(input.text, input.referenceSource);
  if (sharedRun > maxSharedTokens) {
    return { ok: false, reason: `Hint shares ${sharedRun} consecutive tokens with the reference solution (max ${maxSharedTokens}).` };
  }
  return { ok: true };
}
