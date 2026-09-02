import { describe, it, expect, beforeAll, vi } from "vitest";
import fc from "fast-check";
import type { Verdict } from "@prisma/client";
import { scoreIcpc } from "./icpc";
import type { DashboardRegistration, DashboardSubmission } from "./types";

/**
 * Property tests from docs/phases/PHASE-05-contest-engine.md's scoring-engine
 * table. Deterministic unit fixtures (contest-dashboard.test.ts) cover the
 * exact maths; these cover invariants that must hold for *any* input.
 */

const START = new Date("2026-01-01T10:00:00Z");
const END = new Date("2026-01-01T12:00:00Z");
const PROBLEMS = [
  { problemId: "p1", label: "A", points: 100 },
  { problemId: "p2", label: "B", points: 100 },
];
const REGISTRATIONS: DashboardRegistration[] = ["u1", "u2", "u3"].map((userId) => ({
  userId,
  user: { name: userId, institutionId: null, institution: null },
}));

const VERDICTS: Verdict[] = ["AC", "WA", "RE", "TLE", "MLE", "OLE", "PA", "CE", "IE", "SKIP"];

const submissionArb = fc.record({
  userId: fc.constantFrom("u1", "u2", "u3"),
  problemId: fc.constantFrom("p1", "p2"),
  verdict: fc.constantFrom(...VERDICTS),
  minute: fc.integer({ min: 0, max: 119 }),
});

/**
 * Real `Submission.createdAt` values are essentially never exactly equal —
 * sequential DB writes get distinct millisecond timestamps. Two submissions
 * genuinely tied to the millisecond is an inherent (pre-existing, inherited
 * verbatim from before Phase 5) edge case: `icpc.ts` has no secondary
 * tiebreak beyond array order, since Prisma's `orderBy: { createdAt: "asc" }`
 * doesn't guarantee one either. That's a real but practically-unreachable
 * property of the *production* system, not something to paper over here —
 * so the fixture generator adds a per-submission millisecond offset to match
 * reality instead of manufacturing collisions minute-granularity input would
 * cause. The offset is far below one minute, so every `atMin` derivation
 * (floor of ms/60000) is unaffected.
 */
function toSubmissions(
  raw: { userId: string; problemId: string; verdict: Verdict; minute: number }[]
): DashboardSubmission[] {
  return raw.map((r, i) => ({
    id: `s${i}`,
    userId: r.userId,
    problemId: r.problemId,
    verdict: r.verdict,
    createdAt: new Date(START.getTime() + r.minute * 60_000 + i),
  }));
}

/** Production always feeds the engine `orderBy: { createdAt: "asc" }` — that
 * chronological order is part of the engine's contract (it decides "first AC
 * wins" positionally, not by re-deriving time order itself). Sorting here
 * mirrors that contract; what's under test is that array-insertion order for
 * same-instant submissions doesn't leak through. */
function run(submissions: DashboardSubmission[], now = END.getTime() + 60_000) {
  const sorted = [...submissions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return scoreIcpc({
    registrations: REGISTRATIONS,
    contestProblems: PROBLEMS,
    submissions: sorted,
    startsAt: START,
    endsAt: END,
    rules: { freezeMinutes: 0, penaltyPerWrong: 20 },
    createdAt: START,
    now,
  });
}

/** Score-relevant projection — ignores the `cells` map's bookkeeping for
 * verdicts that never touch score/rank (e.g. IE creates an empty cell entry
 * as a side effect, inherited verbatim from the pre-Phase-5 implementation;
 * that's a cosmetic quirk, not a scoring change). */
const scoreView = (rows: ReturnType<typeof run>["rows"]) =>
  rows.map((r) => ({ userId: r.userId, rank: r.rank, solved: r.solved, penalty: r.penalty, points: r.points }));

describe("icpc engine properties", () => {
  // Defensive: another test file in this suite (contest-lifecycle.test.ts)
  // uses vi.useFakeTimers(). Vitest scopes mock state per file, so this
  // shouldn't be reachable here — but this property test computes minutes
  // from wall-clock Date arithmetic across thousands of fast-check runs, so
  // guarantee real timers regardless rather than depend on that isolation.
  beforeAll(() => {
    vi.useRealTimers();
  });

  it("determinism: shuffled submission order produces identical output", () => {
    fc.assert(
      fc.property(fc.array(submissionArb, { minLength: 0, maxLength: 30 }), (raw) => {
        const submissions = toSubmissions(raw);
        const a = run([...submissions]);
        const b = run([...submissions].reverse());
        expect(scoreView(b.rows)).toEqual(scoreView(a.rows));
      }),
      { numRuns: 50 }
    );
  });

  it("no-IE-penalty: injecting IE submissions changes nothing", () => {
    fc.assert(
      fc.property(fc.array(submissionArb, { minLength: 0, maxLength: 20 }), (raw) => {
        const base = toSubmissions(raw);
        const before = run(base);
        const withIe: DashboardSubmission[] = [
          ...base,
          { id: "ie1", userId: "u1", problemId: "p1", verdict: "IE", createdAt: new Date(START.getTime() + 5 * 60_000) },
          { id: "ie2", userId: "u2", problemId: "p2", verdict: "IE", createdAt: new Date(START.getTime() + 50 * 60_000) },
        ];
        const after = run(withIe);
        expect(scoreView(after.rows)).toEqual(scoreView(before.rows));
      }),
      { numRuns: 50 }
    );
  });

  it("rank totality: every participant gets exactly one rank; ties share a rank and the next rank skips", () => {
    fc.assert(
      fc.property(fc.array(submissionArb, { minLength: 0, maxLength: 30 }), (raw) => {
        const result = run(toSubmissions(raw));
        expect(result.rows).toHaveLength(REGISTRATIONS.length);
        expect(result.rows.every((r) => r.rank >= 1)).toBe(true);

        for (let i = 0; i < result.rows.length; i++) {
          const row = result.rows[i];
          if (i === 0) {
            expect(row.rank).toBe(1);
          } else {
            const prev = result.rows[i - 1];
            const tied = prev.solved === row.solved && prev.penalty === row.penalty;
            expect(row.rank).toBe(tied ? prev.rank : i + 1);
          }
        }
      }),
      { numRuns: 50 }
    );
  });

  it("monotonicity: adding a later AC never decreases a participant's total", () => {
    fc.assert(
      fc.property(
        fc.array(submissionArb, { minLength: 0, maxLength: 20 }),
        fc.constantFrom("u1", "u2", "u3"),
        fc.constantFrom("p1", "p2"),
        (raw, userId, problemId) => {
          const base = toSubmissions(raw).filter((s) => !(s.userId === userId && s.problemId === problemId));
          const before = run(base);
          const beforeRow = before.rows.find((r) => r.userId === userId)!;

          const withLateAc: DashboardSubmission[] = [
            ...base,
            { id: "extra-ac", userId, problemId, verdict: "AC", createdAt: new Date(START.getTime() + 119 * 60_000) },
          ];
          const after = run(withLateAc);
          const afterRow = after.rows.find((r) => r.userId === userId)!;
          expect(afterRow.points).toBeGreaterThanOrEqual(beforeRow.points);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Note: unfreezing a real ICPC board *can* reorder participants relative to
  // each other — that's the entire point of a freeze reveal (someone behind
  // pre-freeze can solve more during the frozen window and overtake). The
  // actual invariant is narrower: the *frozen view itself* is stable — what
  // it shows doesn't depend on what happens after the freeze cutoff, only on
  // when you ask (as long as you're still asking before the contest ends).
  it("freeze-invariance: the frozen board doesn't change based on what happens after the freeze cutoff", () => {
    fc.assert(
      fc.property(fc.array(submissionArb, { minLength: 0, maxLength: 20 }), fc.array(submissionArb, { minLength: 0, maxLength: 10 }), (before, extra) => {
        const freezeAtMin = 90;
        const preFreeze = toSubmissions(before).map((s) => ({
          ...s,
          createdAt: new Date(START.getTime() + Math.min(s.createdAt.getTime() - START.getTime(), (freezeAtMin - 1) * 60_000)),
        }));
        const postFreeze = toSubmissions(extra).map((s, i) => ({
          ...s,
          id: `post-${i}`,
          createdAt: new Date(START.getTime() + (freezeAtMin + 1) * 60_000),
        }));

        const scoreAt = (submissions: DashboardSubmission[]) =>
          scoreIcpc({
            registrations: REGISTRATIONS,
            contestProblems: PROBLEMS,
            submissions: [...submissions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
            startsAt: START,
            endsAt: END,
            rules: { freezeMinutes: 120 - freezeAtMin, penaltyPerWrong: 20 },
            createdAt: START,
            now: START.getTime() + 100 * 60_000, // mid-freeze
          });

        const withoutExtra = scoreAt(preFreeze);
        const withExtra = scoreAt([...preFreeze, ...postFreeze]);
        expect(scoreView(withExtra.rows)).toEqual(scoreView(withoutExtra.rows));
      }),
      { numRuns: 50 }
    );
  });
});
