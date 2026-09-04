import { z } from "zod";
import { buildSystemBlocks } from "../client";
import { CPP_TOOL_CONVENTIONS, PLATFORM_CONVENTIONS } from "./shared";

/**
 * Phase 10's variant infrastructure (ProblemVariantTemplate) needs a
 * generator that *draws parameters* (not just an instance) and a reference
 * that solves whatever instance those parameters describe — every student
 * gets their own seed, statement, and test data from the same template.
 */
/** Deliberately restricted to the "int-range" kind of
 * ../../integrity/variants/spec.ts's parameterSpecSchema — the only shape
 * that fits "vary a numeric constant within a range" (D4's scope) without
 * the model having to reason about array/permutation-length degenerate
 * cases too. Persisted output is re-tagged kind: "int-range" for the real
 * schema in features/variant.ts. */
export const VariantOutputSchema = z.object({
  parameterSpec: z
    .array(
      z.object({
        name: z.string().min(1),
        min: z.number().int(),
        max: z.number().int(),
        description: z.string(),
      })
    )
    .min(1)
    .max(4),
  statementTemplate: z
    .string()
    .describe("The problem statement with the varied constants replaced by {{paramName}} placeholders"),
  generatorSource: z
    .string()
    .describe(
      "A complete C++17 program. Reads one line of arbitrary seed text from stdin (a hex string, not necessarily a " +
        "number — hash it, e.g. with std::hash<std::string> or a simple FNV hash, into an integer to seed a PRNG). " +
        "Deterministically draws each parameter within its stated range from that seed, then prints ONLY one valid " +
        "test input for those drawn parameters to stdout, formatted exactly per the problem's Input spec (the " +
        "platform derives the drawn parameter values separately via the same parameterSpec + seed, so do not print " +
        "the parameters themselves)."
    ),
  referenceSource: z
    .string()
    .describe(
      "A complete C++17 program that reads a test input produced for ANY valid draw of the parameters and prints the " +
        "correct output — it must not assume any one instance's specific parameter values."
    ),
});
export type VariantOutput = z.infer<typeof VariantOutputSchema>;

export function buildVariantPrompt(input: {
  statementMd: string;
  constraints: string;
  referenceSource: string;
  referenceLanguage: string;
}) {
  const stable = [
    PLATFORM_CONVENTIONS,
    CPP_TOOL_CONVENTIONS,
    "",
    "## Problem statement",
    input.statementMd,
    "",
    "## Constraints",
    input.constraints,
    "",
    "## Existing single-instance reference solution",
    `\`\`\`${input.referenceLanguage}\n${input.referenceSource}\n\`\`\``,
  ].join("\n");

  const volatile = [
    "Propose 1-4 numeric constants in this problem that can be parameterised per-student without changing the",
    "problem's difficulty or intended approach (e.g. array size bounds, a target value, a modulus) — never the",
    "algorithmic structure itself. Every parameter draw must keep the problem solvable by the same intended approach",
    "and non-degenerate (no drawn instance should be trivially different in difficulty from another).",
  ].join(" ");

  return {
    system: buildSystemBlocks(stable),
    messages: [{ role: "user" as const, content: volatile }],
  };
}
