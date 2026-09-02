import { describe, it, expect } from "vitest";
import { judge } from "./engine";
import type { JudgeJob } from "./protocol";
import { JUDGE_PROTOCOL_VERSION } from "./protocol";
import type { JudgeBackend, RunOutcome, CompileResult } from "./backends/index";

/**
 * Scripted backend — no Docker, no compiler. This is what makes group
 * scoring, dependsOn, and early-stop logic testable in CI (per
 * docs/phases/PHASE-03-judge-engine.md's "Architecture of the engine").
 */
class FakeBackend implements JudgeBackend {
  readonly id = "fake";
  private callIndex = 0;
  cleanedUp = false;
  runCalls = 0;

  constructor(
    private readonly compileResult: CompileResult = { ok: true, stderr: "", ms: 5 },
    private readonly outcomes: RunOutcome[] = []
  ) {}

  async compile(): Promise<CompileResult> {
    return this.compileResult;
  }

  async run(): Promise<RunOutcome> {
    this.runCalls++;
    const outcome = this.outcomes[this.callIndex] ?? this.outcomes[this.outcomes.length - 1];
    this.callIndex++;
    return outcome;
  }

  async cleanup(): Promise<void> {
    this.cleanedUp = true;
  }
}

function ok(stdout: string, overrides: Partial<RunOutcome> = {}): RunOutcome {
  return { status: "ok", stdout, stderr: "", cpuMs: 10, wallMs: 12, exitCode: 0, ...overrides };
}

function baseJob(overrides: Partial<JudgeJob> = {}): JudgeJob {
  return {
    protocol: JUDGE_PROTOCOL_VERSION,
    submissionId: "sub-1",
    kind: "submit",
    language: "c",
    source: "int main(){}",
    limits: { cpuMs: 1000, wallMs: 5000, memoryMb: 256, outputKb: 512, processes: 64 },
    checker: { type: "EXACT" },
    groups: [{ group: 0, name: "main", points: 100, dependsOn: [], stopOnFail: true, cases: [{ index: 0, input: "", expected: "8", sample: true }] }],
    policy: { stopOnFirstFail: false, revealSampleOutput: true },
    ...overrides,
  };
}

describe("engine: compile", () => {
  it("reports CE and skips every group without running any case", async () => {
    const backend = new FakeBackend({ ok: false, stderr: "syntax error", ms: 8 });
    const job = baseJob();
    const report = await judge(job, backend);

    expect(report.verdict).toBe("CE");
    expect(report.compile.stderr).toBe("syntax error");
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].skipped).toBe(true);
    expect(backend.runCalls).toBe(0);
    expect(backend.cleanedUp).toBe(true);
  });
});

describe("engine: single group", () => {
  it("AC when the only case matches", async () => {
    const backend = new FakeBackend(undefined, [ok("8")]);
    const report = await judge(baseJob(), backend);
    expect(report.verdict).toBe("AC");
    expect(report.score).toBe(100);
    expect(report.maxScore).toBe(100);
  });

  it("WA when output mismatches", async () => {
    const backend = new FakeBackend(undefined, [ok("9")]);
    const report = await judge(baseJob(), backend);
    expect(report.verdict).toBe("WA");
    expect(report.score).toBe(0);
  });

  it("surfaces a runtime fault (TLE) as the test and group verdict", async () => {
    const backend = new FakeBackend(undefined, [{ status: "TLE", reason: "wall", stdout: "", stderr: "", cpuMs: 999, wallMs: 5000, exitCode: null }]);
    const report = await judge(baseJob(), backend);
    expect(report.verdict).toBe("TLE");
    expect(report.tests[0].reason).toBe("wall");
  });

  it("stopOnFail stops a group after its first non-AC case", async () => {
    const backend = new FakeBackend(undefined, [ok("wrong"), ok("8")]);
    const job = baseJob({
      groups: [
        {
          group: 0,
          name: "main",
          points: 100,
          dependsOn: [],
          stopOnFail: true,
          cases: [
            { index: 0, input: "", expected: "8", sample: false },
            { index: 1, input: "", expected: "8", sample: false },
          ],
        },
      ],
    });
    const report = await judge(job, backend);
    expect(backend.runCalls).toBe(1);
    expect(report.tests).toHaveLength(1);
  });

  it("without stopOnFail, every case in the group runs", async () => {
    const backend = new FakeBackend(undefined, [ok("wrong"), ok("8")]);
    const job = baseJob({
      groups: [
        {
          group: 0,
          name: "main",
          points: 100,
          dependsOn: [],
          stopOnFail: false,
          cases: [
            { index: 0, input: "", expected: "8", sample: false },
            { index: 1, input: "", expected: "8", sample: false },
          ],
        },
      ],
    });
    await judge(job, backend);
    expect(backend.runCalls).toBe(2);
  });
});

describe("engine: groups, dependsOn and PA", () => {
  it("awards partial credit when only the first subtask passes (AC6)", async () => {
    const backend = new FakeBackend(undefined, [ok("8"), ok("wrong")]);
    const job = baseJob({
      groups: [
        { group: 1, name: "sub1", points: 30, dependsOn: [], stopOnFail: true, cases: [{ index: 0, input: "", expected: "8", sample: false }] },
        { group: 2, name: "sub2", points: 70, dependsOn: [], stopOnFail: true, cases: [{ index: 1, input: "", expected: "8", sample: false }] },
      ],
    });
    const report = await judge(job, backend);
    expect(report.verdict).toBe("PA");
    expect(report.score).toBe(30);
    expect(report.maxScore).toBe(100);
  });

  it("skips a dependent group when its dependency fails, without running its cases", async () => {
    const backend = new FakeBackend(undefined, [ok("wrong")]);
    const job = baseJob({
      groups: [
        { group: 1, name: "sub1", points: 30, dependsOn: [], stopOnFail: true, cases: [{ index: 0, input: "", expected: "8", sample: false }] },
        { group: 2, name: "sub2", points: 70, dependsOn: [1], stopOnFail: true, cases: [{ index: 1, input: "", expected: "8", sample: false }] },
      ],
    });
    const report = await judge(job, backend);
    expect(backend.runCalls).toBe(1);
    const sub2 = report.groups.find((g) => g.group === 2)!;
    expect(sub2.skipped).toBe(true);
    expect(sub2.score).toBe(0);
  });

  it("job-level stopOnFirstFail skips every group after the first failure", async () => {
    const backend = new FakeBackend(undefined, [ok("wrong")]);
    const job = baseJob({
      policy: { stopOnFirstFail: true, revealSampleOutput: true },
      groups: [
        { group: 1, name: "sub1", points: 30, dependsOn: [], stopOnFail: true, cases: [{ index: 0, input: "", expected: "8", sample: false }] },
        { group: 2, name: "sub2", points: 70, dependsOn: [], stopOnFail: true, cases: [{ index: 1, input: "", expected: "8", sample: false }] },
      ],
    });
    const report = await judge(job, backend);
    expect(backend.runCalls).toBe(1);
    expect(report.groups.find((g) => g.group === 2)!.skipped).toBe(true);
  });
});

describe("engine: backend faults", () => {
  it("maps a thrown backend error to IE and still cleans up", async () => {
    class ThrowingBackend implements JudgeBackend {
      readonly id = "throwing";
      cleanedUp = false;
      async compile(): Promise<CompileResult> {
        return { ok: true, stderr: "", ms: 1 };
      }
      async run(): Promise<RunOutcome> {
        throw new Error("runner unreachable");
      }
      async cleanup(): Promise<void> {
        this.cleanedUp = true;
      }
    }
    const backend = new ThrowingBackend();
    const report = await judge(baseJob(), backend);
    expect(report.verdict).toBe("IE");
    expect(report.message).toContain("runner unreachable");
    expect(backend.cleanedUp).toBe(true);
  });
});
