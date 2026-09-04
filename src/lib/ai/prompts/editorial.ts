import { z } from "zod";
import { buildSystemBlocks } from "../client";
import { PLATFORM_CONVENTIONS } from "./shared";

/** D — editorial drafting. Always created as `Editorial{ published: false }`
 * by src/lib/ai/features/editorial.ts; never shown to students unedited. */
export const EditorialOutputSchema = z.object({
  approach: z.string().describe("The core approach in prose, written for a student who solved nothing yet"),
  keyInsight: z.string().describe("The one observation that unlocks the problem"),
  complexity: z.string().describe("Time and space complexity, briefly justified"),
  commonPitfalls: z.array(z.string()).min(1).describe("Specific mistakes, informed by the failing-verdict distribution given"),
  contentMd: z
    .string()
    .describe(
      "The full editorial as Markdown + KaTeX, combining approach/keyInsight/complexity/pitfalls into a readable " +
        "article with headings. This is what gets stored as Editorial.contentMd."
    ),
  annotatedSolution: z.object({
    language: z.string(),
    source: z.string().describe("A clean, commented reference implementation"),
    note: z.string().default(""),
  }),
});
export type EditorialOutput = z.infer<typeof EditorialOutputSchema>;

export function buildEditorialPrompt(input: {
  statementMd: string;
  referenceSolutions: { language: string; source: string }[];
  verdictDistribution: { verdict: string; percent: number }[];
  sampleAcceptedSolutions: { language: string; source: string }[];
}) {
  const stable = [
    PLATFORM_CONVENTIONS,
    "",
    "## Problem statement",
    input.statementMd,
    "",
    "## Reference solution(s)",
    ...input.referenceSolutions.map((r) => `\`\`\`${r.language}\n${r.source}\n\`\`\``),
  ].join("\n");

  const verdictLines = input.verdictDistribution
    .sort((a, b) => b.percent - a.percent)
    .map((v) => `- ${v.verdict}: ${v.percent.toFixed(0)}% of failing submissions`)
    .join("\n");

  const volatile = [
    "## Failing-verdict distribution across real submissions",
    verdictLines || "(no submission data yet)",
    "",
    "## Accepted student solutions, for style/language diversity",
    ...input.sampleAcceptedSolutions.map((s) => `\`\`\`${s.language}\n${s.source}\n\`\`\``),
    "",
    "Write an editorial. If a verdict class dominates failures (e.g. most failures are TLE), the editorial must",
    "explicitly explain why the naive approach hits that verdict and how the intended approach avoids it.",
  ].join("\n");

  return {
    system: buildSystemBlocks(stable),
    messages: [{ role: "user" as const, content: volatile }],
  };
}
