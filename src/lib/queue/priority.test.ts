import { describe, it, expect } from "vitest";
import { priorityFor, JUDGE_PRIORITY } from "./priority";

describe("priorityFor", () => {
  it("puts a live contest submission first regardless of other flags", () => {
    expect(priorityFor({ contestLive: true, authenticated: true })).toBe(JUDGE_PRIORITY.CONTEST_LIVE);
    expect(priorityFor({ contestLive: true, authenticated: false })).toBe(JUDGE_PRIORITY.CONTEST_LIVE);
  });

  it("ranks an assignment deadline above plain practice", () => {
    expect(priorityFor({ hasDeadline: true, authenticated: true })).toBe(JUDGE_PRIORITY.ASSIGNMENT_DEADLINE);
  });

  it("gives authenticated practice the default priority", () => {
    expect(priorityFor({ authenticated: true })).toBe(JUDGE_PRIORITY.PRACTICE_AUTHENTICATED);
  });

  it("deprioritises rejudge batches even during a live contest", () => {
    expect(priorityFor({ rejudge: true, contestLive: true })).toBe(JUDGE_PRIORITY.REJUDGE);
  });

  it("deprioritises anonymous runs below authenticated practice", () => {
    expect(priorityFor({ authenticated: false })).toBe(JUDGE_PRIORITY.ANONYMOUS);
    expect(JUDGE_PRIORITY.ANONYMOUS).toBeGreaterThan(JUDGE_PRIORITY.PRACTICE_AUTHENTICATED);
  });
});
