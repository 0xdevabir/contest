import { prisma } from "../../db";
import { runCustomV2 } from "../../judge/index";
import { storeCaseBlob } from "../../testdata";
import { deriveSeed, drawParameters, renderStatement, type ParameterSpec } from "./spec";

/**
 * D3 v1 — generates one student's parameterised variant: draw parameters
 * from their seed, render the statement, run the generator (seed on stdin)
 * through the judge sandbox to produce test input, then run the reference
 * solution on that input to produce expected output. Everything runs
 * through the same sandbox/limits Phase 3 already uses — no new execution
 * path (docs/phases/PHASE-10-integrity.md D3).
 *
 * Idempotent per (templateId, userId, scopeId): a second call returns the
 * cached ProblemVariant row instead of regenerating.
 */
export async function generateVariant(opts: {
  templateId: string;
  userId: string;
  scopeType: "assignment" | "contest";
  scopeId: string;
}): Promise<{ problemVersionId: string; parameters: Record<string, unknown> }> {
  const existing = await prisma.problemVariant.findUnique({
    where: { templateId_userId_scopeId: { templateId: opts.templateId, userId: opts.userId, scopeId: opts.scopeId } },
  });
  if (existing) {
    return { problemVersionId: existing.problemVersionId, parameters: existing.parameters as Record<string, unknown> };
  }

  const template = await prisma.problemVariantTemplate.findUnique({
    where: { id: opts.templateId },
    include: { problem: { include: { currentVersion: true } } },
  });
  if (!template) throw new Error(`Variant template ${opts.templateId} not found`);
  const source = template.problem.currentVersion;
  if (!source) throw new Error(`Problem ${template.problemId} has no published version to base a variant on`);

  const seed = deriveSeed(opts.templateId, opts.userId, opts.scopeId);
  const spec = template.parameterSpec as unknown as ParameterSpec;
  const parameters = drawParameters(spec, seed);
  const statementMd = renderStatement(template.statementTemplate, parameters);

  const genRunId = `variant-gen-${seed.slice(0, 16)}`;
  const generated = await runCustomV2({
    submissionId: genRunId,
    language: template.generatorLang,
    source: template.generatorSource,
    stdin: seed,
    timeLimitMs: 5000,
    memoryLimitMb: 256,
  });
  const testInput = generated.tests?.[0]?.stdout ?? "";
  if (generated.verdict === "IE" || !testInput) {
    throw new Error(`Variant generator failed for template ${opts.templateId} (seed ${seed})`);
  }

  const refRunId = `variant-ref-${seed.slice(0, 16)}`;
  const reference = await runCustomV2({
    submissionId: refRunId,
    language: template.referenceLang,
    source: template.referenceSource,
    stdin: testInput,
    timeLimitMs: source.timeLimitMs,
    memoryLimitMb: source.memoryLimitMb,
  });
  const expectedOutput = reference.tests?.[0]?.stdout ?? "";
  if (reference.verdict === "IE") {
    throw new Error(`Reference solution failed for variant template ${opts.templateId} (seed ${seed})`);
  }

  const version = await prisma.$transaction(async (tx) => {
    const last = await tx.problemVersion.findFirst({
      where: { problemId: template.problemId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (last?.version ?? 0) + 1;

    const created = await tx.problemVersion.create({
      data: {
        problemId: template.problemId,
        version: nextVersion,
        frozen: true,
        statementMd,
        inputSpec: source.inputSpec,
        outputSpec: source.outputSpec,
        constraints: source.constraints,
        notes: "Generated variant — do not share; every student has a different one.",
        starterCode: source.starterCode as never,
        timeLimitMs: source.timeLimitMs,
        memoryLimitMb: source.memoryLimitMb,
        outputLimitKb: source.outputLimitKb,
        checkerType: source.checkerType,
        checkerEps: source.checkerEps,
        maxScore: source.maxScore,
        createdById: template.createdById,
        publishedAt: new Date(),
      },
    });

    const group = await tx.testGroup.create({
      data: { problemVersionId: created.id, order: 0, name: "main", points: source.maxScore, isSample: false },
    });

    const inputBlob = await storeCaseBlob(template.problemId, created.id, 0, "in", Buffer.from(testInput, "utf8"));
    const expectedBlob = await storeCaseBlob(template.problemId, created.id, 0, "out", Buffer.from(expectedOutput, "utf8"));
    await tx.testCase.create({
      data: {
        testGroupId: group.id,
        order: 0,
        inputKey: inputBlob.key,
        inputInline: inputBlob.inline,
        inputHash: inputBlob.hash,
        inputBytes: inputBlob.bytes,
        expectedKey: expectedBlob.key,
        expectedInline: expectedBlob.inline,
        expectedHash: expectedBlob.hash,
        expectedBytes: expectedBlob.bytes,
      },
    });

    await tx.problemVariant.create({
      data: {
        templateId: opts.templateId,
        userId: opts.userId,
        scopeType: opts.scopeType,
        scopeId: opts.scopeId,
        seed,
        parameters: parameters as never,
        problemVersionId: created.id,
      },
    });

    return created;
  });

  return { problemVersionId: version.id, parameters };
}
