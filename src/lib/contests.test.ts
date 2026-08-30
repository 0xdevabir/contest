import { describe, it, expect } from "vitest";
import {
  contestPhase,
  effectiveContestStatus,
  isContestPublic,
  isContestOpen,
  slugify,
} from "./contests";

const HOUR = 60 * 60 * 1000;

describe("contestPhase", () => {
  const now = Date.now();

  it("is BEFORE when startsAt is in the future", () => {
    expect(contestPhase(new Date(now + HOUR), new Date(now + 2 * HOUR), now)).toBe("BEFORE");
  });
  it("is RUNNING between start and end", () => {
    expect(contestPhase(new Date(now - HOUR), new Date(now + HOUR), now)).toBe("RUNNING");
  });
  it("is ENDED once endsAt has passed", () => {
    expect(contestPhase(new Date(now - 2 * HOUR), new Date(now - HOUR), now)).toBe("ENDED");
  });
  it("is ENDED exactly at the boundary (now === endsAt)", () => {
    expect(contestPhase(new Date(now - HOUR), new Date(now), now)).toBe("ENDED");
  });
  it("is RUNNING with no bounds at all", () => {
    expect(contestPhase(null, null, now)).toBe("RUNNING");
  });
});

describe("effectiveContestStatus", () => {
  const now = Date.now();

  it("downgrades a LIVE contest whose window already closed to ENDED", () => {
    expect(effectiveContestStatus("LIVE", new Date(now - HOUR))).toBe("ENDED");
  });
  it("keeps LIVE when still within the window", () => {
    expect(effectiveContestStatus("LIVE", new Date(now + HOUR))).toBe("LIVE");
  });
  it("keeps LIVE when there is no endsAt", () => {
    expect(effectiveContestStatus("LIVE", null)).toBe("LIVE");
  });
  it("leaves DRAFT/SCHEDULED/ENDED untouched", () => {
    expect(effectiveContestStatus("DRAFT", new Date(now - HOUR))).toBe("DRAFT");
    expect(effectiveContestStatus("SCHEDULED", new Date(now - HOUR))).toBe("SCHEDULED");
    expect(effectiveContestStatus("ENDED", new Date(now - HOUR))).toBe("ENDED");
  });
});

describe("isContestOpen", () => {
  const now = Date.now();

  it("is open while LIVE and within its window", () => {
    expect(isContestOpen("LIVE", new Date(now - HOUR), new Date(now + HOUR))).toBe(true);
  });
  it("is closed once endsAt passes even if still marked LIVE", () => {
    expect(isContestOpen("LIVE", new Date(now - 2 * HOUR), new Date(now - HOUR))).toBe(false);
  });
  it("is closed before startsAt", () => {
    expect(isContestOpen("LIVE", new Date(now + HOUR), null)).toBe(false);
  });
  it("is never open outside LIVE status", () => {
    expect(isContestOpen("DRAFT")).toBe(false);
    expect(isContestOpen("SCHEDULED")).toBe(false);
    expect(isContestOpen("ENDED")).toBe(false);
  });
});

describe("isContestPublic", () => {
  const now = Date.now();

  it("is public whenever effectively LIVE", () => {
    expect(isContestPublic("LIVE", new Date(now - HOUR), new Date(now + HOUR), {})).toBe(true);
  });
  it("is public once ENDED only when publishAfterEnd is set", () => {
    expect(isContestPublic("ENDED", new Date(now - 2 * HOUR), new Date(now - HOUR), { publishAfterEnd: true })).toBe(
      true
    );
    expect(isContestPublic("ENDED", new Date(now - 2 * HOUR), new Date(now - HOUR), {})).toBe(false);
  });
  it("is never public while DRAFT or SCHEDULED", () => {
    expect(isContestPublic("DRAFT", null, null, {})).toBe(false);
    expect(isContestPublic("SCHEDULED", new Date(now + HOUR), null, {})).toBe(false);
  });
});

describe("slugify", () => {
  it("lowercases, collapses non-alphanumerics to hyphens, and trims ends", () => {
    expect(slugify("  Fall '26 -- ICPC  Warmup!!  ")).toBe("fall-26-icpc-warmup");
  });
  it("caps length at 60", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBe(60);
  });
});
