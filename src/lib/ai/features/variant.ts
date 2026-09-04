import { prisma } from "../../db";
import { NotFoundError, ValidationError } from "../../errors";
import { runCustomV2 } from "../../judge/index";
import type { JudgeReport } from "../../judge/protocol";
import { deriveSeed, type ParameterSpec } from "../../integrity/variants/spec";
import { generateStructured } from "../client";
import { runAiJob } from "../job";
import { buildVariantPrompt, VariantOutputSchema, type VariantOutput } from "../prompts/variant";

/**
 * Feature 3 — variant parameterisation. Produces a Phase 10
 * ProblemVariantTemplate draft, then verifies it exactly per D3's test
 * plan: "generate 20 variants, run the reference solution on each, and
 * assert that all 20 produce valid non-degenerate outputs and that
 * runtimes stay within 2x of each other" — before a teacher may use it.
 */

const VERIFY_SEED_COUNT = 20;
const MAX_RUNTIME_RATIO = 2;

function ranCleanly(report: JudgeReport): boolean {
  return report.compile.ok && report.tests.length > 0 && !["TLE", "MLE", "RE", "OLE", "IE"].includes(report.tests[0].verdict);
}

export type VerificationSeedResult = {
  seed: string;
  ok: boolean;
  note?: string;
  outputBytes: number;
  cpuMs: number;
};

export type VerificationReport = {
  ok: boolean;
  seeds: VerificationSeedResult[];
  maxCpuMs: number;
  minCpuMs: number;
  runtimeRatio: number | null;
};

async function verifyTemplate(opts: {
  templateId: string;
  generatorSource: string;
  referenceSource: string;
  timeLimitMs: number;
  memoryLimitMb: number;
}): Promise<VerificationReport> {
  const seeds: VerificationSeedResult[] = [];

  for (let i = 0; i < VERIFY_SEED_COUNT; i++) {
    const seed = deriveSeed(opts.templateId, `preview-${i}`, "verify");
    const genReport = await runCustomV2({
      submissionId: `variant-verify-gen-${opts.templateId}-${i}`,
      language: "cpp17",
      source: opts.generatorSource,
      stdin: seed,
      timeLimitMs: 5_000,
      memoryLimitMb: 512,
    });
    if (!ranCleanly(genReport)) {
      seeds.push({ seed, ok: false, note: "generator failed", outputBytes: 0, cpuMs: 0 });
      continue;
    }
    const testInput = genReport.tests[0].stdout ?? "";

    const refReport = await runCustomV2({
      submissionId: `variant-verify-ref-${opts.templateId}-${i}`,
      language: "cpp17",
      source: opts.referenceSource,
      stdin: testInput,
      timeLimitMs: Math.max(opts.timeLimitMs, 2_000),
      memoryLimitMb: opts.memoryLimitMb,
    });
    if (!ranCleanly(refReport)) {
      seeds.push({ seed, ok: false, note: "reference solution failed", outputBytes: 0, cpuMs: refReport.tests[0]?.cpuMs ?? 0 });
      continue;
    }
    const output = refReport.tests[0].stdout ?? "";
    if (output.trim().length === 0) {
      seeds.push({ seed, ok: false, note: "reference produced an empty (degenerate) output", outputBytes: 0, cpuMs: refReport.tests[0].cpuMs });
      continue;
    }

    seeds.push({ seed, ok: true, outputBytes: Buffer.byteLength(output, "utf8"), cpuMs: refReport.tests[0].cpuMs });
  }

  const okSeeds = seeds.filter((s) => s.ok);
  const cpuTimes = okSeeds.map((s) => s.cpuMs).filter((ms) => ms > 0);
  const maxCpuMs = cpuTimes.length ? Math.max(...cpuTimes) : 0;
  const minCpuMs = cpuTimes.length ? Math.min(...cpuTimes) : 0;
  const runtimeRatio = minCpuMs > 0 ? maxCpuMs / minCpuMs : null;

  const allOk = seeds.every((s) => s.ok);
  const runtimeOk = runtimeRatio === null || runtimeRatio <= MAX_RUNTIME_RATIO;

  return { ok: allOk && runtimeOk, seeds, maxCpuMs, minCpuMs, runtimeRatio };
}

export async function draftVariantTemplate(opts: {
  problemId: string;
  requestedById: string;
  institutionId: string | null;
}): Promise<{ jobId: string; cached: boolean; templateId: string; verification: VerificationReport }> {
  const problem = await prisma.problem.findUnique({
    where: { id: opts.problemId },
    include: { currentVersion: { include: { references: true } } },
  });
  if (!problem || !problem.currentVersion) throw new NotFoundError("Problem has no published version");
  const version = problem.currentVersion;
  const reference = version.references.find((r) => r.expectedVerdict === "AC");
  if (!reference) throw new ValidationError("Add a reference solution with expectedVerdict AC before drafting variants.");

  const { jobId, data, cached } = await runAiJob<VariantOutput>({
    kind: "VARIANT",
    requestedById: opts.requestedById,
    institutionId: opts.institutionId,
    input: { problemId: opts.problemId, versionId: version.id, referenceSource: reference.source },
    run: async () => {
      const prompt = buildVariantPrompt({
        statementMd: version.statementMd,
        constraints: version.constraints,
        referenceSource: reference.source,
        referenceLanguage: reference.language,
      });
      return generateStructured({ ...prompt, schema: VariantOutputSchema, schemaName: "variant", effort: "high" });
    },
  });

  const parameterSpec: ParameterSpec = data.parameterSpec.map((p) => ({
    name: p.name,
    kind: "int-range" as const,
    min: p.min,
    max: p.max,
  }));

  const template = await prisma.problemVariantTemplate.upsert({
    where: { problemId: opts.problemId },
    create: {
      problemId: opts.problemId,
      statementTemplate: data.statementTemplate,
      parameterSpec: parameterSpec as never,
      generatorSource: data.generatorSource,
      generatorLang: "cpp17",
      referenceSource: data.referenceSource,
      referenceLang: "cpp17",
      createdById: opts.requestedById,
    },
    update: {
      statementTemplate: data.statementTemplate,
      parameterSpec: parameterSpec as never,
      generatorSource: data.generatorSource,
      generatorLang: "cpp17",
      referenceSource: data.referenceSource,
      referenceLang: "cpp17",
    },
  });

  const verification = await verifyTemplate({
    templateId: template.id,
    generatorSource: data.generatorSource,
    referenceSource: data.referenceSource,
    timeLimitMs: version.timeLimitMs,
    memoryLimitMb: version.memoryLimitMb,
  });

  return { jobId, cached, templateId: template.id, verification };
}
