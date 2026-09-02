import { spawn } from "child_process";

/**
 * D5 — an interactor process drives the submission: the submission's
 * stdin/stdout are wired to the interactor through pipes with a shared
 * deadline. Like SPECIAL, this is teacher-authored/untrusted code and must
 * run in the sandbox in production; this local implementation exists for
 * dev/testing only (same trust boundary as checkers/special.ts).
 */
export type InteractiveResult = { verdict: "AC" | "WA" | "PE" | "RE"; message: string };

/**
 * Runs a compiled interactor binary and a compiled submission binary wired
 * to each other's stdio, both bounded by `timeoutMs`. The interactor's exit
 * code follows the same testlib convention as SPECIAL checkers.
 */
export function runInteractiveLocal(opts: {
  interactorBin: string;
  interactorArgs: string[];
  submissionBin: string;
  submissionArgs: string[];
  timeoutMs: number;
}): Promise<InteractiveResult> {
  return new Promise((resolve) => {
    const interactor = spawn(opts.interactorBin, opts.interactorArgs, { stdio: ["pipe", "pipe", "pipe"] });
    const submission = spawn(opts.submissionBin, opts.submissionArgs, { stdio: ["pipe", "pipe", "pipe"] });

    let settled = false;
    let interactorStdout = "";

    const finish = (result: InteractiveResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      interactor.kill("SIGKILL");
      submission.kill("SIGKILL");
      resolve(result);
    };

    const timer = setTimeout(() => finish({ verdict: "RE", message: "Interaction deadline exceeded." }), opts.timeoutMs);

    // Interactor's stdout is the submission's stdin, and vice versa.
    interactor.stdout.on("data", (chunk: Buffer) => {
      interactorStdout += chunk.toString("utf8");
      if (!submission.stdin.destroyed) submission.stdin.write(chunk);
    });
    submission.stdout.on("data", (chunk: Buffer) => {
      if (!interactor.stdin.destroyed) interactor.stdin.write(chunk);
    });

    submission.on("error", () => finish({ verdict: "RE", message: "Submission failed to start." }));
    interactor.on("error", () => finish({ verdict: "RE", message: "Interactor failed to start." }));

    submission.on("close", () => {
      // The submission finishing doesn't decide the verdict — the
      // interactor's exit code does, once it also finishes.
      if (!submission.stdin.destroyed) submission.stdin.end();
    });

    interactor.on("close", (code) => {
      if (code === 0) return finish({ verdict: "AC", message: interactorStdout.trim() });
      if (code === 1) return finish({ verdict: "WA", message: interactorStdout.trim() });
      if (code === 2) return finish({ verdict: "PE", message: interactorStdout.trim() });
      return finish({ verdict: "WA", message: interactorStdout.trim() || `interactor exited with code ${code}` });
    });
  });
}
