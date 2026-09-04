import { prisma } from "../db";
import { createProblem } from "../problem-authoring";
import { storeCaseBlob } from "../testdata";
import { runPublishGate } from "../problem-authoring";
import type { Difficulty } from "../types";

/**
 * D3 — "All importers funnel into the Phase 2 authoring API — never direct
 * database writes. That guarantees an imported problem is indistinguishable
 * from a hand-authored one and that validation cannot be bypassed."
 *
 * Shared by polygon.ts and generic.ts: creates the Problem + v1 draft via
 * `createProblem`, writes the test set via the same `storeCaseBlob` +
 * `TestCase` shape the teacher UI's test-upload route uses, adds reference
 * solutions, and runs the publish gate — an import that doesn't validate
 * stays a DRAFT with a clear report rather than silently going live.
 */
export type ImportedCase = { input: string; output: string; sample: boolean; groupName?: string; points?: number };
export type ImportedReference = { language: string; source: string; expectedVerdict: "AC" | "WA" | "TLE" | "RE" | "MLE" };

export async function commitImportedProblem(opts: {
  authorId: string;
  institutionId: string | null;
  title: string;
  slug: string;
  statementMd: string;
  difficulty: Difficulty;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  cases: ImportedCase[];
  references: ImportedReference[];
  source?: string;
  license?: string;
}): Promise<{ problemId: string; slug: string; versionId: string; gatePassed: boolean; gateBlockers: string[] }> {
  const problem = await createProblem(opts.authorId, opts.institutionId, {
    title: opts.title,
    slug: opts.slug,
    difficulty: opts.difficulty,
    visibility: "PRIVATE",
    statementMd: opts.statementMd,
    timeLimitMs: opts.timeLimitMs,
    memoryLimitMb: opts.memoryLimitMb,
  });
  const versionId = problem.versions[0].id;

  // createProblem seeds "samples"/"main" groups; replace them with the
  // imported set so group order/points match the source package.
  await prisma.testCase.deleteMany({ where: { group: { problemVersionId: versionId } } });
  await prisma.testGroup.deleteMany({ where: { problemVersionId: versionId } });

  const groupNames = [...new Set(opts.cases.map((c) => c.groupName ?? (c.sample ? "samples" : "main")))];
  const groupIdByName = new Map<string, string>();
  for (let i = 0; i < groupNames.length; i++) {
    const name = groupNames[i];
    const isSample = name === "samples";
    const points = isSample ? 0 : Math.round(100 / Math.max(1, groupNames.filter((g) => g !== "samples").length));
    const group = await prisma.testGroup.create({
      data: { problemVersionId: versionId, order: i, name, points, isSample },
    });
    groupIdByName.set(name, group.id);
  }

  const orderByGroup = new Map<string, number>();
  for (const c of opts.cases) {
    const groupName = c.groupName ?? (c.sample ? "samples" : "main");
    const groupId = groupIdByName.get(groupName)!;
    const order = orderByGroup.get(groupId) ?? 0;
    orderByGroup.set(groupId, order + 1);

    const input = await storeCaseBlob(problem.id, versionId, order, "in", Buffer.from(c.input, "utf8"));
    const output = await storeCaseBlob(problem.id, versionId, order, "out", Buffer.from(c.output, "utf8"));
    await prisma.testCase.create({
      data: {
        testGroupId: groupId,
        order,
        label: String(order + 1),
        inputKey: input.key,
        inputInline: input.inline,
        inputHash: input.hash,
        inputBytes: input.bytes,
        expectedKey: output.key,
        expectedInline: output.inline,
        expectedHash: output.hash,
        expectedBytes: output.bytes,
      },
    });
  }

  for (const ref of opts.references) {
    await prisma.referenceSolution.create({
      data: {
        problemVersionId: versionId,
        language: ref.language,
        source: ref.source,
        expectedVerdict: ref.expectedVerdict,
        note: opts.source ? `Imported from ${opts.source}` : "Imported",
      },
    });
  }

  const gate = await runPublishGate(versionId).catch(() => null);

  return {
    problemId: problem.id,
    slug: problem.slug,
    versionId,
    gatePassed: gate?.passed ?? false,
    gateBlockers: gate?.blockers ?? ["Publish gate could not run automatically; review manually."],
  };
}
