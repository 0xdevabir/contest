import type { ContestRules } from "../validators";
import { icpcEngine } from "./icpc";
import { ioiEngine } from "./ioi";
import { cfEngine } from "./cf";
import { assignmentEngine } from "./assignment";
import type { ScoringEngine } from "./types";

const REGISTRY: Record<ContestRules["scoring"], ScoringEngine> = {
  icpc: icpcEngine,
  ioi: ioiEngine,
  cf: cfEngine,
  assignment: assignmentEngine,
};

export function pickEngine(scoring: ContestRules["scoring"]): ScoringEngine {
  return REGISTRY[scoring] ?? icpcEngine;
}

export * from "./types";
export { icpcEngine, ioiEngine, cfEngine, assignmentEngine };
