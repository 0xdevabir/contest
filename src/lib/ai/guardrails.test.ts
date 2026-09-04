import { describe, it, expect } from "vitest";
import { containsCodeBlock, longestSharedTokenRun, reviewHintResponse } from "./guardrails";

describe("containsCodeBlock", () => {
  it("detects a fenced code block", () => {
    expect(containsCodeBlock("Here's the fix:\n```cpp\nint x = 0;\n```")).toBe(true);
  });

  it("detects an indented code run", () => {
    expect(containsCodeBlock("Try this:\n    int x = 0;\n    x++;\n    return x;")).toBe(true);
  });

  it("does not flag ordinary prose", () => {
    expect(containsCodeBlock("Check the loop bound — it looks off by one.")).toBe(false);
  });
});

describe("longestSharedTokenRun", () => {
  it("finds a long run of tokens lifted verbatim from the reference", () => {
    const reference = "for (int i = 0; i < n; i++) { sum += a[i]; }";
    const hint = "Something like for (int i = 0; i < n; i++) { sum += a[i]; } should work here.";
    expect(longestSharedTokenRun(hint, reference)).toBeGreaterThan(12);
  });

  it("is low for unrelated text", () => {
    expect(longestSharedTokenRun("Your loop bound looks off by one.", "for (int i = 0; i < n; i++) sum += a[i];")).toBeLessThan(4);
  });
});

describe("reviewHintResponse", () => {
  const reference = "for (int i = 0; i < n; i++) { sum += a[i]; }";

  it("rejects a declared-level mismatch", () => {
    const result = reviewHintResponse({ requestedLevel: 1, declaredLevel: 2, text: "vague nudge", referenceSource: reference });
    expect(result.ok).toBe(false);
  });

  it("rejects a code block at level 1 or 2", () => {
    const result = reviewHintResponse({
      requestedLevel: 1,
      declaredLevel: 1,
      text: "```cpp\nint x;\n```",
      referenceSource: reference,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a response that leaks the reference solution", () => {
    const result = reviewHintResponse({
      requestedLevel: 3,
      declaredLevel: 3,
      text: `Try: for (int i = 0; i < n; i++) { sum += a[i]; }`,
      referenceSource: reference,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a clean, on-level hint", () => {
    const result = reviewHintResponse({
      requestedLevel: 1,
      declaredLevel: 1,
      text: "Your loop bound looks off by one — check what happens at the last index.",
      referenceSource: reference,
    });
    expect(result.ok).toBe(true);
  });
});
