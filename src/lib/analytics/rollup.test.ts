import { describe, expect, it } from "vitest";
import { laplaceMastery } from "./rollup";

describe("laplaceMastery", () => {
  it("does not let a 1/1 sample outrank a large, mostly-solved sample", () => {
    const oneForOne = laplaceMastery(1, 1);
    const eighteenOfTwenty = laplaceMastery(18, 20);
    expect(oneForOne).toBeLessThan(eighteenOfTwenty);
  });

  it("matches the documented formula (solved+1)/(attempted+2)", () => {
    expect(laplaceMastery(0, 0)).toBeCloseTo(0.5);
    expect(laplaceMastery(1, 1)).toBeCloseTo(2 / 3);
    expect(laplaceMastery(18, 20)).toBeCloseTo(19 / 22);
    expect(laplaceMastery(0, 5)).toBeCloseTo(1 / 7);
  });

  it("is monotonically increasing in solved for a fixed attempted", () => {
    expect(laplaceMastery(2, 10)).toBeLessThan(laplaceMastery(5, 10));
  });
});
