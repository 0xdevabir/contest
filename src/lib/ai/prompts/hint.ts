import { z } from "zod";
import { buildSystemBlocks } from "../client";
import { PLATFORM_CONVENTIONS } from "./shared";
import type { HintLevel } from "../guardrails";

/**
 * D5 (docs/phases/PHASE-15-intelligence.md) — "the hardest prompt-engineering
 * problem in this phase." Enforcement layer 1 of 4 lives here: explicit
 * level rules and refusal instructions. Layers 2-4 (self-declared level,
 * post-filter, contest/assignment lockout) are in guardrails.ts and
 * features/hint.ts — this prompt alone is never trusted to hold the line.
 */
export const HintOutputSchema = z.object({
  level: z.number().int().min(1).max(3).describe("The level this hint actually adheres to — must equal the requested level"),
  text: z.string().describe("The hint shown to the student"),
});
export type HintOutput = z.infer<typeof HintOutputSchema>;

const LEVEL_RULES: Record<HintLevel, string> = {
  1: `LEVEL 1 — NUDGE. Name only the *category* of the bug (e.g. "an off-by-one
in a loop bound", "an integer overflow", "a missing base case"). Do NOT
mention line numbers, variable names from the student's code, corrected
code, or the algorithm/approach. One or two sentences.`,
  2: `LEVEL 2 — DIRECTION. Point at the region of the code and the concept
involved (e.g. "the condition on the loop that processes the array fails
when the array has exactly one element"). You may reference what the code
does structurally. Do NOT provide corrected code or a full algorithm
sketch. A short paragraph.`,
  3: `LEVEL 3 — EXPLAIN. Explain the bug and the correct approach in prose,
in enough depth that a student who reads carefully can fix it themselves.
Do NOT include any code the student could paste directly into their
solution — describe logic in words, not syntax. No code blocks, ever,
at any level.`,
};

export function buildHintPrompt(input: {
  requestedLevel: HintLevel;
  statementMd: string;
  studentCode: string;
  studentLanguage: string;
  failingInput: string;
  verdict: string;
}) {
  const stable = [
    PLATFORM_CONVENTIONS,
    "",
    "You write hints for a student's failing submission. You will never see the expected output for the failing",
    "test — only its input and the verdict — so you cannot and must not claim to know the exact expected output.",
    "",
    "Absolute rules, all levels: never output a fenced code block or anything that reads as pasteable code. Never",
    "reveal the full correct algorithm as a step-by-step recipe at levels 1-2. Never solve the problem for the",
    "student. If you cannot produce a hint at the requested level without breaking a rule above, write the most",
    "conservative hint you can that still respects the level's intent.",
    "",
    "## Problem statement",
    input.statementMd,
  ].join("\n");

  const volatile = [
    LEVEL_RULES[input.requestedLevel],
    "",
    `## Student's submission (${input.studentLanguage})`,
    `\`\`\`${input.studentLanguage}\n${input.studentCode}\n\`\`\``,
    "",
    `## Verdict: ${input.verdict}`,
    "## Failing test's input only (the expected output is deliberately withheld from you)",
    input.failingInput,
    "",
    `Write a level ${input.requestedLevel} hint per the rules above. Set "level" to ${input.requestedLevel}.`,
  ].join("\n");

  return {
    system: buildSystemBlocks(stable),
    messages: [{ role: "user" as const, content: volatile }],
  };
}
