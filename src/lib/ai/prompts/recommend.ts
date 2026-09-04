import { z } from "zod";
import { buildSystemBlocks } from "../client";
import { PLATFORM_CONVENTIONS } from "./shared";

/**
 * D4 — the recommender's score is pure arithmetic (../recommend/score.ts);
 * this is the only AI call in that feature, and it only writes the
 * one-sentence *reason* shown to the student. Batched nightly, never on
 * page load.
 */
export const RecommendExplainOutputSchema = z.object({
  reason: z.string().max(160).describe("One sentence, second person, explaining why this problem was picked"),
});
export type RecommendExplainOutput = z.infer<typeof RecommendExplainOutputSchema>;

export function buildRecommendExplainPrompt(input: {
  problemTitle: string;
  problemTags: string[];
  studentRecentSolvedTitles: string[];
  weakestTags: string[];
  difficultyDeltaFromRating: number;
}) {
  const stable = [
    PLATFORM_CONVENTIONS,
    "",
    "Write a single encouraging, specific sentence telling a student why a practice problem was recommended to",
    "them. Second person ('You've...'). No filler, no exclamation points, under 160 characters.",
  ].join("\n");

  const volatile = [
    `Recommended problem: "${input.problemTitle}" (tags: ${input.problemTags.join(", ") || "none"})`,
    `Roughly ${Math.round(input.difficultyDeltaFromRating)} rating points above the student's current rating.`,
    `Student's weakest tags: ${input.weakestTags.join(", ") || "none tracked yet"}.`,
    `Recently solved: ${input.studentRecentSolvedTitles.slice(0, 5).join(", ") || "nothing yet"}.`,
  ].join("\n");

  return {
    system: buildSystemBlocks(stable),
    messages: [{ role: "user" as const, content: volatile }],
  };
}
