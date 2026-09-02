import { describe, it, expect } from "vitest";
import { normalizeSource } from "./index";

/** D1 — renaming identifiers, reformatting whitespace, and adding comments
 * must all collapse to the identical token stream; reordering independent
 * top-level functions preserves the same token multiset (still structurally
 * comparable, just permuted). */
describe("normalizeSource — c-like", () => {
  const base = `
int sum(int a, int b) {
    int total = a + b;
    return total;
}
`;

  it("collapses renamed identifiers to the same stream", () => {
    const renamed = `
int sum(int x, int y) {
    int result = x + y;
    return result;
}
`;
    expect(normalizeSource(renamed, "c")).toEqual(normalizeSource(base, "c"));
  });

  it("collapses reformatted whitespace to the same stream", () => {
    const reformatted = `int sum(int a,int b){int total=a+b;return total;}`;
    expect(normalizeSource(reformatted, "c")).toEqual(normalizeSource(base, "c"));
  });

  it("collapses added comments to the same stream", () => {
    const commented = `
// computes a sum
int sum(int a, int b) { // parameters
    int total = a + b; /* accumulate */
    return total;
}
`;
    expect(normalizeSource(commented, "c")).toEqual(normalizeSource(base, "c"));
  });

  it("keeps the same token multiset when two independent functions are reordered", () => {
    const original = `
int add(int a, int b) { return a + b; }
int sub(int a, int b) { return a - b; }
`;
    const reordered = `
int sub(int a, int b) { return a - b; }
int add(int a, int b) { return a + b; }
`;
    const sort = (tokens: string[]) => [...tokens].sort();
    expect(sort(normalizeSource(reordered, "c"))).toEqual(sort(normalizeSource(original, "c")));
    expect(normalizeSource(reordered, "c")).not.toEqual(normalizeSource(original, "c"));
  });

  it("renames non-keyword identifiers to V but keeps control-flow keywords literal", () => {
    const tokens = normalizeSource(`for (int i = 0; i < n; i++) { if (i) continue; }`, "c");
    expect(tokens).toContain("for");
    expect(tokens).toContain("if");
    expect(tokens).toContain("continue");
    expect(tokens).toContain("V"); // i, n
    expect(tokens).not.toContain("i");
    expect(tokens).not.toContain("n");
  });

  it("placeholders string/char literals instead of leaking their content", () => {
    const tokens = normalizeSource(`char *s = "secret"; char c = 'x';`, "c");
    expect(tokens.filter((t) => t === "S")).toHaveLength(2);
    expect(tokens.join(" ")).not.toContain("secret");
  });
});
