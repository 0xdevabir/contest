import { z } from "zod";
import { buildSystemBlocks } from "../client";
import { CPP_TOOL_CONVENTIONS, PLATFORM_CONVENTIONS } from "./shared";

/**
 * D3 (docs/phases/PHASE-15-intelligence.md) — "the pipeline is not 'ask for
 * test cases'. It is: ask for a generator program." The model never
 * produces expected output; src/lib/ai/features/testgen.ts always derives
 * that by running the teacher's own reference solution, so a hallucination
 * can only yield a useless test, never a wrong one.
 */
export const TestgenOutputSchema = z.object({
  rationale: z
    .string()
    .describe("What edge cases and complexity classes this generator targets, and why, for the teacher's review"),
  edgeCases: z
    .array(z.string())
    .min(1)
    .describe("Short labels for each targeted case, e.g. 'n=1', 'all-equal', 'adversarial for O(n^2)'"),
  generatorSource: z
    .string()
    .describe(
      "A complete C++17 program. It reads exactly one non-negative integer seed from stdin (use it to seed std::mt19937), " +
        "and writes exactly one valid test input to stdout, formatted exactly per the problem's Input spec. Different seeds " +
        "must be able to produce different edge cases, not just different random instances of the same shape."
    ),
  validatorSource: z
    .string()
    .describe(
      "A complete C++17 program. It reads a test input from stdin and checks every stated constraint (bounds, format, counts). " +
        "Exit 0 if all constraints hold. Otherwise print which constraint failed to stderr and exit 1."
    ),
});
export type TestgenOutput = z.infer<typeof TestgenOutputSchema>;

export function buildTestgenPrompt(input: {
  statementMd: string;
  inputSpec: string;
  outputSpec: string;
  constraints: string;
  referenceSource: string;
  referenceLanguage: string;
  targetCount: number;
  existingCaseCount: number;
}) {
  const stable = [
    PLATFORM_CONVENTIONS,
    CPP_TOOL_CONVENTIONS,
    "",
    "## Problem statement",
    input.statementMd,
    "",
    "## Input format",
    input.inputSpec,
    "",
    "## Output format",
    input.outputSpec,
    "",
    "## Constraints",
    input.constraints,
    "",
    "## Reference solution (assumed correct — this is what produces expected output; never second-guess it)",
    `\`\`\`${input.referenceLanguage}\n${input.referenceSource}\n\`\`\``,
  ].join("\n");

  const volatile = [
    `The problem already has ${input.existingCaseCount} test case(s). Generate a generator that can produce at least`,
    `${input.targetCount} diverse valid inputs (one per seed 1..${input.targetCount}). Explicitly cover: minimum and`,
    "maximum constraint values, empty/single-element inputs where applicable, all-identical values, sorted and",
    "reverse-sorted order, arithmetic overflow boundaries, and an adversarial case for the reference's complexity class",
    "(a case that would time out an asymptotically worse but plausible wrong solution).",
  ].join(" ");

  return {
    system: buildSystemBlocks(stable),
    messages: [{ role: "user" as const, content: volatile }],
  };
}
