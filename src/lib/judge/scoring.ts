import type { GroupReport } from "./protocol";

/**
 * D-scoring — the execution algorithm's group/subtask scoring, kept separate
 * from engine.ts's run loop so it is a pure function testable without a
 * backend. Binary groups (all-or-nothing per group) is the IOI convention
 * and the default; a per-case-proportional mode is a future
 * `TestGroup.scoreMode` field, not built here.
 */

/** A group is skipped (score 0, never run) unless every group it depends on fully passed. */
export function dependenciesSatisfied(dependsOn: number[], priorGroups: ReadonlyMap<number, GroupReport>): boolean {
  return dependsOn.every((dep) => {
    const r = priorGroups.get(dep);
    return r != null && !r.skipped && r.points > 0 && r.score >= r.points;
  });
}

/**
 * Reduces one group's per-case verdicts to a group verdict and score.
 * `caseVerdicts` reflects only the cases actually run (stopOnFail may have
 * truncated the list) — an empty group is treated as WA, never AC, so an
 * authoring mistake (a group with zero cases) can't silently award points.
 */
export function scoreGroup(points: number, caseVerdicts: string[]): { verdict: string; score: number } {
  if (caseVerdicts.length === 0) return { verdict: "WA", score: 0 };
  const firstFail = caseVerdicts.find((v) => v !== "AC");
  if (!firstFail) return { verdict: "AC", score: points };
  return { verdict: firstFail, score: 0 };
}

/**
 * Overall verdict:
 * - every group fully scored -> AC
 * - some (not all) groups fully scored -> PA
 * - otherwise -> the first non-AC group's verdict, in group order
 */
export function overallVerdict(groups: readonly GroupReport[]): string {
  const scored = groups.filter((g) => !g.skipped);
  const fullyPassed = (g: GroupReport) => g.score >= g.points;

  if (scored.length > 0 && scored.every(fullyPassed)) return "AC";
  if (scored.some(fullyPassed)) return "PA";

  for (const g of groups) {
    if (g.skipped) continue;
    if (g.verdict !== "AC") return g.verdict;
  }
  return groups.length ? "WA" : "SKIP";
}

export function totalScore(groups: readonly GroupReport[]): number {
  return groups.reduce((sum, g) => sum + g.score, 0);
}

export function totalMaxScore(groups: readonly GroupReport[]): number {
  return groups.reduce((sum, g) => sum + g.points, 0);
}
