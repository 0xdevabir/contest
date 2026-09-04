import { prisma } from "../../db";
import { NotFoundError, ValidationError } from "../../errors";
import { runCustomV2 } from "../../judge/index";
import type { JudgeReport } from "../../judge/protocol";
import { generateStructured } from "../client";
import { runAiJob } from "../job";
import { buildTestgenPrompt } from "../prompts/testgen";
import { TestgenOutputSchema } from "../prompts/testgen";

/**
 * D3 (docs/phases/PHASE-15-intelligence.md) — generate-then-verify. The
 * model produces a generator + validator program (../prompts/testgen.ts);
 * this module compiles and runs them through the exact same sandbox the
 * judge itself uses (runCustomV2, mirroring ../../integrity/variants/
 * generate.ts's Phase 10 pattern), derives every expected output from the
 * teacher's own reference solution, and never trusts a model-produced
 * expected output because there isn't one.
 */

const NON_CLEAN_RUN_VERDICTS = new Set(["TLE", "MLE", "RE", "OLE", "IE"]);

/** True when the program ran to completion without crashing/timing out —
 * independent of the checker verdict, since runCustomV2 always checks
 * against an empty expected string (see runCustomV2's own doc comment). */
function ranCleanly(report: JudgeReport): boolean {
  return report.compile.ok && report.tests.length > 0 && !NON_CLEAN_RUN_VERDICTS.has(report.tests[0].verdict);
}

function shapeKeyFor(input: string): string {
  const trimmed = input.trim();
  const lineCount = trimmed.length ? trimmed.split("\n").length : 0;
  const lengthBucket = Math.floor(Math.log2(Math.max(1, trimmed.length)));
  return `lines=${lineCount};len~2^${lengthBucket}`;
}

export type TestgenCase = {
  seed: number;
  input: string;
  expectedOutput: string;
  valid: boolean;
  note?: string;
  shapeKey: string;
};

export type DiversitySummary = {
  ok: boolean;
  maxShareFraction: number;
  buckets: Record<string, number>;
};

export type TestgenResult = {
  rationale: string;
  edgeCases: string[];
  generatorSource: string;
  validatorSource: string;
  cases: TestgenCase[];
  diversity: DiversitySummary;
};

function summarizeDiversity(cases: TestgenCase[]): DiversitySummary {
  const valid = cases.filter((c) => c.valid);
  const buckets: Record<string, number> = {};
  for (const c of valid) buckets[c.shapeKey] = (buckets[c.shapeKey] ?? 0) + 1;
  const maxCount = Math.max(0, ...Object.values(buckets));
  const maxShareFraction = valid.length > 0 ? maxCount / valid.length : 0;
  return { ok: maxShareFraction <= 0.7, maxShareFraction, buckets };
}

export async function generateTestData(opts: {
  problemId: string;
  versionId: string;
  requestedById: string;
  institutionId: string | null;
  targetCount: number;
}): Promise<{ jobId: string; cached: boolean; result: TestgenResult }> {
  const version = await prisma.problemVersion.findUnique({
    where: { id: opts.versionId },
    include: { references: true, groups: { include: { cases: true } } },
  });
  if (!version || version.problemId !== opts.problemId) throw new NotFoundError("Problem version not found");

  const reference = version.references.find((r) => r.expectedVerdict === "AC");
  if (!reference) throw new ValidationError("Add a reference solution with expectedVerdict AC before generating test data.");

  const existingCaseCount = version.groups.reduce((sum, g) => sum + g.cases.length, 0);
  const targetCount = Math.max(1, Math.min(Math.round(opts.targetCount), 100));

  const { jobId, data, cached } = await runAiJob<TestgenResult>({
    kind: "TESTGEN",
    requestedById: opts.requestedById,
    institutionId: opts.institutionId,
    input: {
      problemId: opts.problemId,
      versionId: opts.versionId,
      referenceId: reference.id,
      referenceSource: reference.source,
      statementMd: version.statementMd,
      constraints: version.constraints,
      targetCount,
    },
    run: async () => {
      const prompt = buildTestgenPrompt({
        statementMd: version.statementMd,
        inputSpec: version.inputSpec,
        outputSpec: version.outputSpec,
        constraints: version.constraints,
        referenceSource: reference.source,
        referenceLanguage: reference.language,
        targetCount,
        existingCaseCount,
      });
      const { data: plan, usage } = await generateStructured({
        ...prompt,
        schema: TestgenOutputSchema,
        schemaName: "testgen",
        effort: "high",
      });

      const runTag = `${opts.versionId}-${Date.now()}`;
      const cases: TestgenCase[] = [];

      for (let seed = 1; seed <= targetCount; seed++) {
        const genReport = await runCustomV2({
          submissionId: `testgen-gen-${runTag}-${seed}`,
          language: "cpp17",
          source: plan.generatorSource,
          stdin: `${seed}\n`,
          timeLimitMs: 5_000,
          memoryLimitMb: 512,
        });
        if (!ranCleanly(genReport)) {
          cases.push({ seed, input: "", expectedOutput: "", valid: false, note: `generator failed: ${genReport.tests[0]?.verdict ?? genReport.verdict}`, shapeKey: "n/a" });
          continue;
        }
        const generatedInput = genReport.tests[0].stdout ?? "";

        const validatorReport = await runCustomV2({
          submissionId: `testgen-val-${runTag}-${seed}`,
          language: "cpp17",
          source: plan.validatorSource,
          stdin: generatedInput,
          timeLimitMs: 5_000,
          memoryLimitMb: 512,
        });
        if (!ranCleanly(validatorReport)) {
          cases.push({ seed, input: generatedInput, expectedOutput: "", valid: false, note: "validator rejected this input", shapeKey: shapeKeyFor(generatedInput) });
          continue;
        }

        const refReport = await runCustomV2({
          submissionId: `testgen-ref-${runTag}-${seed}`,
          language: reference.language,
          source: reference.source,
          stdin: generatedInput,
          timeLimitMs: Math.max(version.timeLimitMs, 2_000),
          memoryLimitMb: version.memoryLimitMb,
        });
        if (!ranCleanly(refReport)) {
          cases.push({ seed, input: generatedInput, expectedOutput: "", valid: false, note: `reference solution failed: ${refReport.tests[0]?.verdict ?? refReport.verdict}`, shapeKey: shapeKeyFor(generatedInput) });
          continue;
        }

        cases.push({
          seed,
          input: generatedInput,
          expectedOutput: refReport.tests[0].stdout ?? "",
          valid: true,
          shapeKey: shapeKeyFor(generatedInput),
        });
      }

      const result: TestgenResult = {
        rationale: plan.rationale,
        edgeCases: plan.edgeCases,
        generatorSource: plan.generatorSource,
        validatorSource: plan.validatorSource,
        cases,
        diversity: summarizeDiversity(cases),
      };
      return { data: result, usage };
    },
  });

  return { jobId, cached, result: data };
}
