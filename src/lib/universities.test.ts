import { describe, it, expect } from "vitest";
import { UNIVERSITIES, universityLabel, isUniversityCode } from "./universities";

describe("universityLabel", () => {
  it("resolves a known code to its full name", () => {
    expect(universityLabel("DIU")).toBe("Daffodil International University");
  });
  it("falls back to the raw code for an unknown value", () => {
    expect(universityLabel("XYZ")).toBe("XYZ");
  });
});

describe("isUniversityCode", () => {
  it("accepts every code in the registry", () => {
    for (const u of UNIVERSITIES) expect(isUniversityCode(u.code)).toBe(true);
  });
  it("rejects an unknown code", () => {
    expect(isUniversityCode("MIT")).toBe(false);
  });
});
