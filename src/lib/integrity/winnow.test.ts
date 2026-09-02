import { describe, expect, it } from "vitest";
import { fingerprintTokens, kgramHashes, K_GRAM_SIZE, WINDOW_SIZE, winnow } from "./winnow";
import { normalizeSource } from "./normalize";

function repeat(token: string, n: number): string[] {
  return Array.from({ length: n }, () => token);
}

describe("kgramHashes / winnow", () => {
  it("keeps a density-bounded subset (roughly w tokens apart)", () => {
    const tokens = Array.from({ length: 500 }, (_, i) => `t${i % 17}`);
    const selected = winnow(kgramHashes(tokens));
    // A dense fingerprint would be ~475 k-grams; winnowing must reduce it a lot.
    expect(selected.length).toBeLessThan(tokens.length / 4);
    expect(selected.length).toBeGreaterThan(0);
  });

  it("detection guarantee: any shared substring of length >= w+k-1 produces a shared hash", () => {
    const shared = repeat("SHARED", WINDOW_SIZE + K_GRAM_SIZE - 1);
    const a = [...repeat("A", 10), ...shared, ...repeat("B", 10)];
    const b = [...repeat("C", 5), ...shared, ...repeat("D", 20)];

    const fpA = new Set(fingerprintTokens(a));
    const fpB = new Set(fingerprintTokens(b));
    const overlap = [...fpA].filter((h) => fpB.has(h));
    expect(overlap.length).toBeGreaterThan(0);
  });

  it("is stable for identical input", () => {
    const tokens = Array.from({ length: 200 }, (_, i) => `t${i % 11}`);
    expect(fingerprintTokens(tokens)).toEqual(fingerprintTokens(tokens));
  });

  it("winnows an empty or short token stream to nothing", () => {
    expect(fingerprintTokens([])).toEqual([]);
    expect(fingerprintTokens(["a", "b"])).toEqual([]);
  });
});

describe("normalizeSource + fingerprint invariance", () => {
  const original = `
    #include <stdio.h>
    // reads n and prints its square
    int compute(int n) {
      int result = n * n;
      return result;
    }
    int main() {
      int x;
      scanf("%d", &x);
      printf("%d\\n", compute(x));
      return 0;
    }
  `;

  it("is invariant to identifier renaming", () => {
    const renamed = original.replace(/\bresult\b/g, "answer").replace(/\bx\b/g, "value");
    expect(fingerprintTokens(normalizeSource(original, "c"))).toEqual(
      fingerprintTokens(normalizeSource(renamed, "c"))
    );
  });

  it("is invariant to added comments and reformatted whitespace", () => {
    const reformatted = original
      .split("\n")
      .map((l) => `  /* note */ ${l.trim()}`)
      .join("\n\n\n");
    expect(fingerprintTokens(normalizeSource(original, "c"))).toEqual(
      fingerprintTokens(normalizeSource(reformatted, "c"))
    );
  });

  it("differs for genuinely different logic", () => {
    const different = `
      int compute(int n) { return n + n + n + n + n; }
      int main() { int x; scanf("%d", &x); printf("%d\\n", compute(x)); return 0; }
    `;
    const fpA = fingerprintTokens(normalizeSource(original, "c"));
    const fpB = fingerprintTokens(normalizeSource(different, "c"));
    expect(fpA).not.toEqual(fpB);
  });
});
