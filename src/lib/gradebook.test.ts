import { describe, expect, it } from "vitest";
import { lateMultiplier } from "./gradebook";

const DUE = new Date("2026-01-10T00:00:00.000Z");

describe("lateMultiplier", () => {
  it("NONE: full credit exactly at dueAt, zero one second after", () => {
    expect(lateMultiplier(DUE, DUE, "NONE", 0)).toBe(1);
    expect(lateMultiplier(DUE, new Date(DUE.getTime() + 1000), "NONE", 0)).toBe(0);
  });

  it("LINEAR: loses lateParam percent per day, floored at 0", () => {
    // 10%/day, 1 day late -> 0.9
    const oneDayLate = new Date(DUE.getTime() + 24 * 60 * 60 * 1000);
    expect(lateMultiplier(DUE, oneDayLate, "LINEAR", 10)).toBeCloseTo(0.9);
    // 26 hours late at 10%/day -> 1 - 0.10 * (26/24) ≈ 0.8917 (doc's acceptance criterion 3 rounds to 80% with steeper params)
    const twentySixHoursLate = new Date(DUE.getTime() + 26 * 60 * 60 * 1000);
    expect(lateMultiplier(DUE, twentySixHoursLate, "LINEAR", 10)).toBeCloseTo(1 - 0.1 * (26 / 24), 5);
    // Floored at 0, never negative.
    const wayLate = new Date(DUE.getTime() + 20 * 24 * 60 * 60 * 1000);
    expect(lateMultiplier(DUE, wayLate, "LINEAR", 10)).toBe(0);
    expect(lateMultiplier(DUE, DUE, "LINEAR", 10)).toBe(1);
  });

  it("GRACE_THEN_LINEAR: full credit within grace hours, then 10%/day after", () => {
    const graceHours = 6;
    const midGrace = new Date(DUE.getTime() + 3 * 60 * 60 * 1000);
    expect(lateMultiplier(DUE, midGrace, "GRACE_THEN_LINEAR", graceHours)).toBe(1);
    const rightAtGrace = new Date(DUE.getTime() + graceHours * 60 * 60 * 1000);
    expect(lateMultiplier(DUE, rightAtGrace, "GRACE_THEN_LINEAR", graceHours)).toBe(1);
    // 1 day past the end of grace -> 0.9
    const oneDayPastGrace = new Date(DUE.getTime() + graceHours * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
    expect(lateMultiplier(DUE, oneDayPastGrace, "GRACE_THEN_LINEAR", graceHours)).toBeCloseTo(0.9);
  });

  it("REJECT: full credit before dueAt, zero for any (grandfathered) late submission", () => {
    expect(lateMultiplier(DUE, DUE, "REJECT", 0)).toBe(1);
    expect(lateMultiplier(DUE, new Date(DUE.getTime() + 1000), "REJECT", 0)).toBe(0);
  });

  it("no dueAt means never late", () => {
    expect(lateMultiplier(null, new Date("2099-01-01"), "LINEAR", 50)).toBe(1);
  });
});
