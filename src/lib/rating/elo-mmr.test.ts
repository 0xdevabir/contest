import { describe, expect, it } from "vitest";
import {
  DEFAULT_MU,
  DEFAULT_SIGMA,
  displayedRating,
  updateRatingsForContest,
  type ContestFieldEntry,
  type SkillState,
} from "./elo-mmr";

function fresh(id: string): ContestFieldEntry {
  return { id, rank: 0, prior: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA } };
}

describe("updateRatingsForContest", () => {
  it("rewards the winner and penalises the loser of a two-player field", () => {
    const field: ContestFieldEntry[] = [
      { ...fresh("a"), rank: 1 },
      { ...fresh("b"), rank: 2 },
    ];
    const [a, b] = updateRatingsForContest(field);
    expect(a.after.mu).toBeGreaterThan(a.before.mu);
    expect(b.after.mu).toBeLessThan(b.before.mu);
  });

  it("is symmetric: swapping ranks swaps the outcome", () => {
    const field: ContestFieldEntry[] = [
      { ...fresh("a"), rank: 1 },
      { ...fresh("b"), rank: 2 },
    ];
    const swapped: ContestFieldEntry[] = [
      { ...fresh("a"), rank: 2 },
      { ...fresh("b"), rank: 1 },
    ];
    const [a1] = updateRatingsForContest(field);
    const [, b2] = updateRatingsForContest(swapped);
    expect(a1.after.mu).toBeCloseTo(b2.after.mu, 6);
  });

  it("gives a bigger gain to a lower-rated player who beats a higher-rated field", () => {
    const underdog: ContestFieldEntry = { id: "underdog", rank: 1, prior: { mu: 1200, sigma: 100 } };
    const favorite: ContestFieldEntry = { id: "favorite", rank: 2, prior: { mu: 1800, sigma: 100 } };
    const [u] = updateRatingsForContest([underdog, favorite]);

    const evenA: ContestFieldEntry = { id: "evenA", rank: 1, prior: { mu: 1500, sigma: 100 } };
    const evenB: ContestFieldEntry = { id: "evenB", rank: 2, prior: { mu: 1500, sigma: 100 } };
    const [ea] = updateRatingsForContest([evenA, evenB]);

    expect(u.after.mu - u.before.mu).toBeGreaterThan(ea.after.mu - ea.before.mu);
  });

  it("shrinks sigma for a returning player relative to a fresh drift-only step", () => {
    const veteran: ContestFieldEntry = { id: "v", rank: 1, prior: { mu: 1500, sigma: 80 } };
    const rookie: ContestFieldEntry = { id: "r", rank: 2, prior: { mu: 1500, sigma: 350 } };
    const [v, r] = updateRatingsForContest([veteran, rookie]);
    // A low-sigma veteran should end with lower sigma than a high-sigma rookie
    // in the same contest — more prior evidence means the posterior stays tighter.
    expect(v.after.sigma).toBeLessThan(r.after.sigma);
  });

  it("keeps every result within a bounded delta for a same-skill field (no runaway)", () => {
    const field: ContestFieldEntry[] = Array.from({ length: 10 }, (_, i) => ({
      ...fresh(`p${i}`),
      rank: i + 1,
    }));
    const results = updateRatingsForContest(field);
    for (const r of results) {
      expect(Math.abs(r.after.mu - r.before.mu)).toBeLessThan(1000);
      expect(r.after.sigma).toBeGreaterThan(0);
    }
  });
});

describe("determinism", () => {
  it("reprocessing the same contests in the same order reproduces identical ratings", () => {
    const contests: ContestFieldEntry[][] = [
      [
        { id: "a", rank: 1, prior: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA } },
        { id: "b", rank: 2, prior: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA } },
        { id: "c", rank: 3, prior: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA } },
      ],
    ];

    function replay(): Record<string, SkillState> {
      const state: Record<string, SkillState> = {
        a: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
        b: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
        c: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
      };
      for (const contest of contests) {
        const field = contest.map((e) => ({ ...e, prior: state[e.id] }));
        const results = updateRatingsForContest(field);
        for (const r of results) state[r.id] = r.after;
      }
      return state;
    }

    const first = replay();
    const second = replay();
    expect(first).toEqual(second);
  });

  it("a new competitor's sigma shrinks over repeated contests against a stable field", () => {
    let state: SkillState = { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA };
    const sigmas: number[] = [state.sigma];
    for (let i = 0; i < 5; i++) {
      const field: ContestFieldEntry[] = [
        { id: "newcomer", rank: 3, prior: state },
        { id: "vetA", rank: 1, prior: { mu: 1600, sigma: 100 } },
        { id: "vetB", rank: 2, prior: { mu: 1550, sigma: 100 } },
      ];
      const [newcomer] = updateRatingsForContest(field);
      state = newcomer.after;
      sigmas.push(state.sigma);
    }
    expect(sigmas[sigmas.length - 1]).toBeLessThan(sigmas[0]);
  });
});

describe("displayedRating", () => {
  it("is conservative early: mu - 2*sigma, floored", () => {
    expect(displayedRating({ mu: 1500, sigma: 350 })).toBe(800);
    expect(displayedRating({ mu: 100, sigma: 350 })).toBe(400); // floor
  });

  it("converges toward mu as sigma shrinks", () => {
    expect(displayedRating({ mu: 1500, sigma: 60 })).toBe(1380);
  });
});
