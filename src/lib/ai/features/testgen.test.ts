import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../db", () => ({
  prisma: {
    problemVersion: { findUnique: vi.fn() },
  },
}));
vi.mock("../../judge/index", () => ({ runCustomV2: vi.fn() }));
vi.mock("../client", () => ({
  generateStructured: vi.fn(),
  buildSystemBlocks: (stable: string) => [{ type: "text", text: stable }],
}));
vi.mock("../job", () => ({
  runAiJob: vi.fn(async (opts: { run: () => Promise<{ data: unknown; usage: unknown }> }) => {
    const { data } = await opts.run();
    return { jobId: "job1", cached: false, data };
  }),
}));

import { prisma } from "../../db";
import { runCustomV2 } from "../../judge/index";
import { generateStructured } from "../client";
import { generateTestData } from "./testgen";

function version() {
  return {
    id: "v1",
    problemId: "p1",
    statementMd: "stmt",
    inputSpec: "in",
    outputSpec: "out",
    constraints: "n <= 1e5",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    references: [{ id: "r1", language: "cpp17", source: "int main(){}", expectedVerdict: "AC" }],
    groups: [{ cases: [] }],
  };
}

function report(overrides: Partial<{ verdict: string; compileOk: boolean; stdout: string }> = {}) {
  const verdict = overrides.verdict ?? "WA";
  return {
    protocol: 1,
    submissionId: "s",
    verdict,
    score: 0,
    maxScore: 0,
    compile: { ok: overrides.compileOk ?? true, stderr: "", ms: 0 },
    groups: [],
    tests: [{ index: 0, verdict, cpuMs: 10, wallMs: 10, stdout: overrides.stdout ?? "" }],
    judge: { workerId: "local", durationMs: 0 },
  };
}

describe("generateTestData", () => {
  beforeEach(() => vi.resetAllMocks());

  it("excludes a seed whose generator fails cleanly, without throwing the whole batch", async () => {
    vi.mocked(prisma.problemVersion.findUnique).mockResolvedValue(version() as never);
    vi.mocked(generateStructured).mockResolvedValue({
      data: {
        rationale: "covers edges",
        edgeCases: ["n=1"],
        generatorSource: "// gen",
        validatorSource: "// val",
      },
      usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0, costCents: 1 },
      rawUsage: {} as never,
    } as never);

    // seed 1: generator TLEs (fails cleanly); seed 2: everything succeeds.
    vi.mocked(runCustomV2).mockImplementation(async (opts: { submissionId: string }) => {
      if (opts.submissionId.includes("-gen-") && opts.submissionId.endsWith("-1")) {
        return report({ verdict: "TLE" }) as never;
      }
      if (opts.submissionId.includes("-gen-")) return report({ verdict: "WA", stdout: "5\n1 2 3 4 5\n" }) as never;
      if (opts.submissionId.includes("-val-")) return report({ verdict: "AC", stdout: "" }) as never;
      return report({ verdict: "WA", stdout: "15\n" }) as never; // reference
    });

    const { result } = await generateTestData({
      problemId: "p1",
      versionId: "v1",
      requestedById: "u1",
      institutionId: null,
      targetCount: 2,
    });

    expect(result.cases).toHaveLength(2);
    expect(result.cases[0].valid).toBe(false);
    expect(result.cases[0].note).toMatch(/generator failed/);
    expect(result.cases[1].valid).toBe(true);
    expect(result.cases[1].expectedOutput).toBe("15\n");
  });

  it("flags low diversity when every valid case shares the same shape", async () => {
    vi.mocked(prisma.problemVersion.findUnique).mockResolvedValue(version() as never);
    vi.mocked(generateStructured).mockResolvedValue({
      data: { rationale: "r", edgeCases: ["e"], generatorSource: "g", validatorSource: "v" },
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, costCents: 0 },
      rawUsage: {} as never,
    } as never);
    vi.mocked(runCustomV2).mockImplementation(async (opts: { submissionId: string }) => {
      if (opts.submissionId.includes("-gen-")) return report({ verdict: "WA", stdout: "1\n1\n" }) as never;
      if (opts.submissionId.includes("-val-")) return report({ verdict: "AC", stdout: "" }) as never;
      return report({ verdict: "WA", stdout: "1\n" }) as never;
    });

    const { result } = await generateTestData({
      problemId: "p1",
      versionId: "v1",
      requestedById: "u1",
      institutionId: null,
      targetCount: 5,
    });

    expect(result.diversity.ok).toBe(false);
    expect(result.diversity.maxShareFraction).toBe(1);
  });
});
