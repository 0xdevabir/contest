import { describe, expect, it } from "vitest";
import { boilerplateHashes, excludeHashes, jaccard, median, zScore } from "./compare";

describe("jaccard", () => {
  it("is 1 for identical sets and 0 for disjoint sets", () => {
    expect(jaccard(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
    expect(jaccard(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("handles two empty fingerprints without dividing by zero", () => {
    expect(jaccard([], [])).toBe(0);
  });
});

describe("median", () => {
  it("computes median for even and odd length arrays", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("zScore — population baseline (D2)", () => {
  it("gives a trivial problem's identical-but-unremarkable solutions a low z despite high raw similarity", () => {
    // Every submission to "read two ints, print the sum" hovers around 80-90%.
    const population = Array.from({ length: 50 }, (_, i) => 0.75 + (i % 10) * 0.02);
    const z = zScore(0.85, population);
    expect(Math.abs(z)).toBeLessThan(2);
  });

  it("gives a hard problem's near-identical pair a high z when the population is usually dissimilar", () => {
    const population = Array.from({ length: 50 }, (_, i) => 0.1 + (i % 5) * 0.02);
    const z = zScore(0.85, population);
    expect(z).toBeGreaterThan(3);
  });
});

describe("boilerplateHashes", () => {
  it("excludes a hash shared by more than 20% of submissions", () => {
    const common = "TEMPLATE_HASH";
    // 10 submissions: 6 use the template (60% > 20%), 4 don't. Each has a
    // unique personal hash too, at 10% each (below the 20% threshold).
    const fingerprints = Array.from({ length: 10 }, (_, i) =>
      i < 6 ? [common, `unique${i}`] : [`unique${i}`]
    );
    const boilerplate = boilerplateHashes(fingerprints);
    expect(boilerplate.has(common)).toBe(true);
    expect(excludeHashes([common, "unique0"], boilerplate)).toEqual(["unique0"]);
  });

  it("keeps a hash only two students happen to share out of a larger population", () => {
    // 2 of 20 submissions share "shared" (10% < 20%) — not boilerplate.
    const fingerprints = Array.from({ length: 20 }, (_, i) =>
      i < 2 ? ["shared", `unique${i}`] : [`unique${i}`]
    );
    const boilerplate = boilerplateHashes(fingerprints);
    expect(boilerplate.has("shared")).toBe(false);
  });
});
