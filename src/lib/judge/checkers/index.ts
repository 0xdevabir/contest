import type { Checker } from "../protocol";
import { checkExact } from "./exact";
import { checkToken } from "./token";
import { checkFloat } from "./float";
import { runSpecialCheckerLocal } from "./special";
import { localJudgeAllowed } from "../../judge";

export type CheckOutcome = { verdict: "AC" | "WA" | "PE"; message?: string };

export type SpecialRunner = (opts: {
  programSource: string;
  programLanguage: string;
  input: string;
  expected: string;
  actual: string;
}) => Promise<CheckOutcome>;

/**
 * D5 dispatch by CheckerType. EXACT/TOKEN/FLOAT are trusted framework code
 * and always run here, in-process. SPECIAL is teacher-authored/untrusted —
 * production must supply `specialRunner` (backed by the sandboxed runner
 * backend); without one this falls back to the same
 * ALLOW_INSECURE_LOCAL_JUDGE-gated local path used for dev compilation.
 * INTERACTIVE is not dispatched here: the interaction itself is the run, so
 * engine.ts asks the backend to drive it directly and use its verdict.
 */
export async function checkOutput(
  checker: Checker,
  ctx: { input: string; expected: string; actual: string },
  opts: { specialRunner?: SpecialRunner } = {}
): Promise<CheckOutcome> {
  switch (checker.type) {
    case "EXACT":
      return { verdict: checkExact(ctx.expected, ctx.actual) };
    case "TOKEN":
      return { verdict: checkToken(ctx.expected, ctx.actual) };
    case "FLOAT":
      return { verdict: checkFloat(ctx.expected, ctx.actual, checker.epsilon ?? 1e-6) };
    case "SPECIAL": {
      if (!checker.programSource || !checker.programLanguage) {
        throw new Error("SPECIAL checker requires programSource and programLanguage");
      }
      if (opts.specialRunner) return opts.specialRunner({ ...checker, ...ctx, programSource: checker.programSource, programLanguage: checker.programLanguage });
      if (!localJudgeAllowed()) {
        throw new Error("No sandboxed special-checker backend configured, and local fallback is disabled.");
      }
      return runSpecialCheckerLocal({ ...ctx, programSource: checker.programSource, programLanguage: checker.programLanguage });
    }
    case "INTERACTIVE":
      throw new Error("INTERACTIVE checkers are driven by the backend's run step, not checkOutput().");
    default: {
      const exhaustive: never = checker.type;
      throw new Error(`Unknown checker type: ${exhaustive}`);
    }
  }
}
