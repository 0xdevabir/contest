import { describe, it, expect } from "vitest";
import { getLanguage, findLanguage, requireEnabledLanguage, listEnabledLanguages, listLanguages, scaledLimits, UnknownLanguageError, LanguageDisabledError } from "./registry";

describe("language registry", () => {
  it("lists exactly the six enabled languages plus Go disabled (AC8)", () => {
    const enabled = listEnabledLanguages().map((l) => l.id).sort();
    expect(enabled).toEqual(["c", "cpp17", "cpp20", "java17", "js", "py311"].sort());

    const go = findLanguage("go");
    expect(go).toBeTruthy();
    expect(go!.enabled).toBe(false);
  });

  it("throws ValidationError-shaped errors for an unknown language", () => {
    expect(() => getLanguage("rust")).toThrow(UnknownLanguageError);
  });

  it("rejects a disabled language at submission time", () => {
    expect(() => requireEnabledLanguage("go")).toThrow(LanguageDisabledError);
  });

  it("is ordered for the language dropdown", () => {
    const ids = listLanguages().map((l) => l.order);
    const sorted = [...ids].sort((a, b) => a - b);
    expect(ids).toEqual(sorted);
  });

  it("scales C 1:1 and Python/Java per their documented factors (D1/D2/D3)", () => {
    const c = getLanguage("c");
    expect(scaledLimits(c, { timeLimitMs: 1000, memoryLimitMb: 256 })).toEqual({
      cpuMs: 1000,
      wallMs: 3 * 1000 + 2000,
      memoryMb: 256,
    });

    const py = getLanguage("py311");
    const pyLimits = scaledLimits(py, { timeLimitMs: 1000, memoryLimitMb: 256 });
    expect(pyLimits.cpuMs).toBe(3000);
    expect(pyLimits.memoryMb).toBe(256 * 2 + 32);

    const java = getLanguage("java17");
    const javaLimits = scaledLimits(java, { timeLimitMs: 1000, memoryLimitMb: 256 });
    expect(javaLimits.cpuMs).toBe(2000);
    expect(javaLimits.memoryMb).toBe(256 * 2 + 256);
  });

  it("D2: wall limit is 3x CPU limit plus a 2s backstop", () => {
    const c = getLanguage("c");
    const { cpuMs, wallMs } = scaledLimits(c, { timeLimitMs: 2000, memoryLimitMb: 256 });
    expect(wallMs).toBe(3 * cpuMs + 2000);
  });
});
