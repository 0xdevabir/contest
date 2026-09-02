import { describe, it, expect } from "vitest";
import { normalizeSource } from "./index";

describe("normalizeSource — python", () => {
  const base = `
def total(a, b):
    result = a + b
    return result
`;

  it("collapses renamed identifiers to the same stream", () => {
    const renamed = `
def total(x, y):
    r = x + y
    return r
`;
    expect(normalizeSource(renamed, "py311")).toEqual(normalizeSource(base, "py311"));
  });

  it("collapses reformatted whitespace to the same stream", () => {
    const reformatted = `def total(a,b):\n  result=a+b\n  return result`;
    expect(normalizeSource(reformatted, "py311")).toEqual(normalizeSource(base, "py311"));
  });

  it("collapses added comments to the same stream", () => {
    const commented = `
# computes a total
def total(a, b):  # params
    result = a + b  # accumulate
    return result
`;
    expect(normalizeSource(commented, "py311")).toEqual(normalizeSource(base, "py311"));
  });

  it("placeholders string literals instead of leaking their content", () => {
    const tokens = normalizeSource(`s = "secret"\nt = '''also secret'''`, "py311");
    expect(tokens.filter((t) => t === "S")).toHaveLength(2);
    expect(tokens.join(" ")).not.toContain("secret");
  });
});
