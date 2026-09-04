import { prisma } from "../../db";
import { assertVersionEditable, requireOwnedVersion } from "../../problem-authoring";
import type { SessionUser } from "../../auth";
import { generateStructured } from "../client";
import { runAiJob } from "../job";
import { buildTranslatePrompt, TranslateOutputSchema, type TranslateOutput } from "../prompts/translate";

/**
 * D6 (docs/phases/PHASE-15-intelligence.md) — "AI may draft a Bangla
 * statement; a human must approve it before it is visible." Writes the
 * Bangla fields Phase 14 already added to ProblemVersion, but deliberately
 * never touches `bnApprovedById`/`bnApprovedAt` — those stay null (or
 * whatever a prior human approval set them to) until a teacher explicitly
 * approves, at which point this draft is indistinguishable from one they
 * typed by hand.
 */
export async function draftTranslation(opts: {
  problemId: string;
  versionId: string;
  actor: SessionUser;
  institutionId: string | null;
}): Promise<{ jobId: string; cached: boolean; draft: TranslateOutput }> {
  const { version } = await requireOwnedVersion(opts.problemId, opts.versionId, opts.actor);
  await assertVersionEditable(opts.versionId);

  const problem = await prisma.problem.findUniqueOrThrow({ where: { id: opts.problemId }, select: { title: true } });

  const { jobId, data, cached } = await runAiJob<TranslateOutput>({
    kind: "TRANSLATE",
    requestedById: opts.actor.id,
    institutionId: opts.institutionId,
    input: {
      versionId: opts.versionId,
      title: problem.title,
      statementMd: version.statementMd,
      inputSpec: version.inputSpec,
      outputSpec: version.outputSpec,
      constraints: version.constraints,
    },
    run: async () => {
      const prompt = buildTranslatePrompt({
        title: problem.title,
        statementMd: version.statementMd,
        inputSpec: version.inputSpec,
        outputSpec: version.outputSpec,
        constraints: version.constraints,
      });
      return generateStructured({ ...prompt, schema: TranslateOutputSchema, schemaName: "translate", effort: "high" });
    },
  });

  // Draft only — writes the Bangla fields but leaves bnApprovedById/At
  // untouched, so the existing spoiler/visibility gate (Phase 14) keeps
  // hiding it from students until a teacher reviews and approves.
  await prisma.problemVersion.update({
    where: { id: opts.versionId },
    data: {
      titleBn: data.titleBn,
      statementBn: data.statementBn,
      inputSpecBn: data.inputSpecBn,
      outputSpecBn: data.outputSpecBn,
      constraintsBn: data.constraintsBn,
    },
  });

  return { jobId, cached, draft: data };
}
