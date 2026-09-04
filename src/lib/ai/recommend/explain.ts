import { generateStructured } from "../client";
import { buildRecommendExplainPrompt, RecommendExplainOutputSchema } from "../prompts/recommend";
import { runAiJob } from "../job";

/**
 * D4 — the only AI call in the recommender: one sentence explaining a score
 * that was already computed deterministically (../score.ts). Called from
 * the nightly batch (worker/src/recommend-tick.ts), never on page load.
 */
export async function explainRecommendation(opts: {
  requestedById: string;
  institutionId: string | null;
  problemTitle: string;
  problemTags: string[];
  studentRecentSolvedTitles: string[];
  weakestTags: string[];
  difficultyDeltaFromRating: number;
}): Promise<string> {
  const { data } = await runAiJob<{ reason: string }>({
    kind: "RECOMMEND",
    requestedById: opts.requestedById,
    institutionId: opts.institutionId,
    input: {
      problemTitle: opts.problemTitle,
      problemTags: opts.problemTags,
      weakestTags: opts.weakestTags,
      difficultyDeltaFromRating: Math.round(opts.difficultyDeltaFromRating),
    },
    run: async () => {
      const prompt = buildRecommendExplainPrompt(opts);
      return generateStructured({
        ...prompt,
        schema: RecommendExplainOutputSchema,
        schemaName: "recommend_explain",
        effort: "medium",
      });
    },
  });
  return data.reason;
}
