import { prisma } from "../../db";
import { NotFoundError } from "../../errors";
import { getSubmissionPayload } from "../../submission-payload";
import { generateStructured } from "../client";
import { runAiJob } from "../job";
import { buildEditorialPrompt, EditorialOutputSchema, type EditorialOutput } from "../prompts/editorial";

/**
 * Editorial drafting (docs/phases/PHASE-15-intelligence.md, feature 2).
 * "Always a draft: created as Editorial{ published: false }" — this reuses
 * Phase 11's Editorial model directly rather than a new one; the only new
 * thing is the AiJob audit trail behind it.
 */
export async function draftEditorial(opts: {
  problemId: string;
  requestedById: string;
  institutionId: string | null;
}): Promise<{ jobId: string; cached: boolean; editorialId: string }> {
  const problem = await prisma.problem.findUnique({
    where: { id: opts.problemId },
    include: { currentVersion: { include: { references: true } } },
  });
  if (!problem || !problem.currentVersion) throw new NotFoundError("Problem has no published version");
  const version = problem.currentVersion;

  const [verdictRows, sampleAccepted] = await Promise.all([
    prisma.submission.groupBy({
      by: ["verdict"],
      where: { problemRefId: opts.problemId, verdict: { notIn: ["AC", "PENDING", "JUDGING"] } },
      _count: true,
    }),
    prisma.submission.findMany({
      where: { problemRefId: opts.problemId, verdict: "AC" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, language: true, code: true, stdout: true, stderr: true, report: true, payloadKey: true },
      distinct: ["language"],
    }),
  ]);
  const sampleAcceptedWithCode = await Promise.all(
    sampleAccepted.map(async (s) => ({ language: s.language, source: (await getSubmissionPayload(s)).code }))
  );
  const totalFailing = verdictRows.reduce((s, r) => s + r._count, 0);
  const verdictDistribution = verdictRows.map((r) => ({
    verdict: r.verdict,
    percent: totalFailing > 0 ? (r._count / totalFailing) * 100 : 0,
  }));

  const { jobId, data, cached } = await runAiJob<EditorialOutput>({
    kind: "EDITORIAL",
    requestedById: opts.requestedById,
    institutionId: opts.institutionId,
    input: {
      problemId: opts.problemId,
      versionId: version.id,
      statementMd: version.statementMd,
      referenceIds: version.references.map((r) => r.id),
    },
    run: async () => {
      const prompt = buildEditorialPrompt({
        statementMd: version.statementMd,
        referenceSolutions: version.references.map((r) => ({ language: r.language, source: r.source })),
        verdictDistribution,
        sampleAcceptedSolutions: sampleAcceptedWithCode,
      });
      return generateStructured({ ...prompt, schema: EditorialOutputSchema, schemaName: "editorial", effort: "high" });
    },
  });

  const editorial = await prisma.editorial.upsert({
    where: { problemId_problemVersionId: { problemId: opts.problemId, problemVersionId: version.id } },
    create: {
      problemId: opts.problemId,
      problemVersionId: version.id,
      authorId: opts.requestedById,
      contentMd: data.contentMd,
      solutions: [data.annotatedSolution],
      published: false,
    },
    update: {
      contentMd: data.contentMd,
      solutions: [data.annotatedSolution],
      published: false,
    },
  });

  return { jobId, cached, editorialId: editorial.id };
}
