import { z } from "zod";
import { buildSystemBlocks } from "../client";
import { PLATFORM_CONVENTIONS } from "./shared";

/** D6 — Bangla drafts only; ProblemVersion.bnApprovedById (Phase 14) stays
 * null until a human approves, regardless of what this produces. */
export const TranslateOutputSchema = z.object({
  titleBn: z.string(),
  statementBn: z.string(),
  inputSpecBn: z.string(),
  outputSpecBn: z.string(),
  constraintsBn: z.string(),
  numberCheckNote: z
    .string()
    .describe("A short note listing every number/constraint from the English source and confirming each appears unchanged in the Bangla draft"),
});
export type TranslateOutput = z.infer<typeof TranslateOutputSchema>;

export function buildTranslatePrompt(input: {
  title: string;
  statementMd: string;
  inputSpec: string;
  outputSpec: string;
  constraints: string;
}) {
  const stable = [
    PLATFORM_CONVENTIONS,
    "",
    "Translate this problem into standard, exam-register Bangla. Preserve Markdown/KaTeX syntax exactly — translate",
    "only prose, never math, code, or variable names. Every number, bound, and constraint MUST be character-for-",
    "character identical to the English source — a mistranslated constraint produces wrong answers.",
  ].join("\n");

  const volatile = [
    `## Title\n${input.title}`,
    `## Statement\n${input.statementMd}`,
    `## Input format\n${input.inputSpec}`,
    `## Output format\n${input.outputSpec}`,
    `## Constraints\n${input.constraints}`,
  ].join("\n\n");

  return {
    system: buildSystemBlocks(stable),
    messages: [{ role: "user" as const, content: volatile }],
  };
}
