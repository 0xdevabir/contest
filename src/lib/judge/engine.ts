import type { JudgeJob, JudgeReport, GroupReport, TestReport } from "./protocol";
import type { JudgeBackend } from "./backends/index";
import { checkOutput } from "./checkers/index";
import { dependenciesSatisfied, scoreGroup, overallVerdict, totalScore, totalMaxScore } from "./scoring";
import { getLanguage } from "./languages/registry";

/**
 * Pure orchestration: compile -> per-group run -> check -> score. Takes a
 * JudgeBackend so it is unit-testable against a fake backend that returns
 * scripted per-test outcomes, without Docker — see engine.test.ts. This is
 * what makes group scoring, dependsOn, and early-stop logic testable in CI.
 */
export async function judge(job: JudgeJob, backend: JudgeBackend, workerId = "local"): Promise<JudgeReport> {
  const started = Date.now();
  const groupsInOrder = [...job.groups].sort((a, b) => a.group - b.group);
  const groupReports: GroupReport[] = [];
  const priorGroups = new Map<number, GroupReport>();
  const tests: TestReport[] = [];

  const skipPlaceholder = (group: (typeof groupsInOrder)[number]): GroupReport => ({
    group: group.group,
    verdict: "SKIP",
    score: 0,
    points: group.points,
    skipped: true,
  });

  const finish = (verdictOverride?: string): JudgeReport => {
    const groups = groupReports;
    return {
      protocol: job.protocol,
      submissionId: job.submissionId,
      verdict: verdictOverride ?? overallVerdict(groups),
      score: totalScore(groups),
      maxScore: totalMaxScore(groups),
      compile: compileResultForReport,
      groups,
      tests,
      maxCpuMs: tests.length ? Math.max(...tests.map((t) => t.cpuMs)) : undefined,
      maxWallMs: tests.length ? Math.max(...tests.map((t) => t.wallMs)) : undefined,
      maxMemoryKb: tests.some((t) => t.memoryKb != null) ? Math.max(...tests.map((t) => t.memoryKb ?? 0)) : undefined,
      judge: { workerId, image: backend.imageRef?.(), durationMs: Date.now() - started },
    };
  };

  let compileResultForReport = { ok: true, stderr: "", ms: 0 };

  try {
    const compiled = await backend.compile({
      language: getLanguage(job.language),
      source: job.source,
    });
    compileResultForReport = compiled;

    if (!compiled.ok) {
      for (const group of groupsInOrder) groupReports.push(skipPlaceholder(group));
      return finish("CE");
    }

    let stopped = false;

    for (const group of groupsInOrder) {
      if (stopped) {
        groupReports.push(skipPlaceholder(group));
        continue;
      }
      if (!dependenciesSatisfied(group.dependsOn, priorGroups)) {
        groupReports.push(skipPlaceholder(group));
        continue;
      }

      const caseVerdicts: string[] = [];
      for (const testCase of group.cases) {
        const outcome = await backend.run({ input: testCase.input, limits: job.limits, checker: job.checker });

        let verdict: string;
        if (job.checker.type === "INTERACTIVE") {
          verdict = outcome.interactiveVerdict ?? (outcome.status === "ok" ? "WA" : outcome.status);
        } else if (outcome.status !== "ok") {
          verdict = outcome.status;
        } else {
          const checked = await checkOutput(job.checker, { input: testCase.input, expected: testCase.expected, actual: outcome.stdout });
          verdict = checked.verdict;
        }

        // Full stdout/stderr is kept on every test here, sample or hidden —
        // this is the internal report shape teachers/admins see in full.
        // Redacting hidden-test output for the *student*-facing client is
        // the API boundary's job (see sanitizeResultsForClient in
        // src/app/api/judge/route.ts), not the engine's.
        tests.push({
          index: testCase.index,
          verdict,
          cpuMs: outcome.cpuMs,
          wallMs: outcome.wallMs,
          memoryKb: outcome.memoryKb,
          reason: outcome.reason,
          stdout: outcome.stdout,
          stderr: outcome.stderr,
        });

        caseVerdicts.push(verdict);
        if (verdict !== "AC" && group.stopOnFail) break;
      }

      const scored = scoreGroup(group.points, caseVerdicts);
      const groupReport: GroupReport = { group: group.group, verdict: scored.verdict, score: scored.score, points: group.points, skipped: false };
      groupReports.push(groupReport);
      priorGroups.set(group.group, groupReport);

      if (job.policy.stopOnFirstFail && scored.verdict !== "AC") stopped = true;
    }

    return finish();
  } catch (err) {
    // A worker/backend fault is never the submitter's fault (D-verdicts, IE).
    for (const group of groupsInOrder) {
      if (!groupReports.find((g) => g.group === group.group)) groupReports.push(skipPlaceholder(group));
    }
    const report = finish("IE");
    report.message = err instanceof Error ? err.message : String(err);
    return report;
  } finally {
    await backend.cleanup().catch(() => undefined);
  }
}
