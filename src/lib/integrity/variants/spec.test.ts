import { describe, expect, it } from "vitest";
import { deriveSeed, drawParameters, renderStatement, type ParameterSpec } from "./spec";

const spec: ParameterSpec = [
  { name: "n", kind: "int-range", min: 5, max: 20 },
  { name: "op", kind: "choice", options: ["add", "sub", "mul"] },
  { name: "arr", kind: "int-array", length: 5, min: 1, max: 100 },
  { name: "perm", kind: "permutation", length: 6 },
];

describe("drawParameters", () => {
  it("is deterministic for the same seed", () => {
    const seed = deriveSeed("tpl1", "user1", "assign1");
    expect(drawParameters(spec, seed)).toEqual(drawParameters(spec, seed));
  });

  it("differs across users", () => {
    const seedA = deriveSeed("tpl1", "userA", "assign1");
    const seedB = deriveSeed("tpl1", "userB", "assign1");
    expect(drawParameters(spec, seedA)).not.toEqual(drawParameters(spec, seedB));
  });

  it("respects int-range bounds", () => {
    const seed = deriveSeed("tpl1", "user1", "assign1");
    const { n } = drawParameters(spec, seed);
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(20);
  });

  it("draws a valid permutation of 1..length", () => {
    const seed = deriveSeed("tpl1", "user1", "assign1");
    const { perm } = drawParameters(spec, seed) as { perm: number[] };
    expect([...perm].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("renderStatement", () => {
  it("substitutes placeholders and joins arrays with spaces", () => {
    const rendered = renderStatement("N = {{n}}, array = {{arr}}", { n: 7, arr: [1, 2, 3] });
    expect(rendered).toBe("N = 7, array = 1 2 3");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(renderStatement("{{missing}}", {})).toBe("{{missing}}");
  });
});
