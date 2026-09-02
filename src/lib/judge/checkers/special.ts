import { createHash } from "crypto";
import { spawn } from "child_process";
import { mkdtemp, writeFile, chmod, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

/**
 * D5 — testlib-compatible exit codes, so setters can reuse existing
 * checkers: 0 = AC, 1 = WA, 2 = PE, message on stdout. Compiled once per
 * source hash so a contest with 500 submissions to one special-judge problem
 * compiles the checker once (D5).
 *
 * D5 also requires special/interactive checkers to run *in the sandbox*
 * since they are teacher-authored, therefore untrusted, code. This module is
 * the dev/local fallback (same trust model as src/lib/judge.ts's
 * ALLOW_INSECURE_LOCAL_JUDGE path) — production routes through the runner
 * backend, which must compile and run the checker inside its own sandboxed
 * container rather than on the worker host.
 */

export type SpecialCheckResult = { verdict: "AC" | "WA" | "PE"; message: string };

const compiledCache = new Map<string, string>();

function hashSource(source: string, language: string): string {
  return createHash("sha256").update(language).update("\0").update(source).digest("hex");
}

async function compileCLikeChecker(source: string, language: "c" | "cpp"): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ch-checker-"));
  const ext = language === "cpp" ? "cpp" : "c";
  const src = path.join(dir, `checker.${ext}`);
  const bin = path.join(dir, "checker");
  await writeFile(src, source, "utf8");

  const compiler = language === "cpp" ? (process.platform === "darwin" ? "clang++" : "g++") : process.platform === "darwin" ? "clang" : "gcc";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(compiler, ["-O2", "-std=" + (language === "cpp" ? "c++17" : "c11"), "-o", bin, src], {
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`checker compile failed (exit ${code})`))));
  });

  await chmod(bin, 0o755);
  return bin;
}

/**
 * Compiles (if not already cached by source hash) and runs a special
 * checker as `checker input expected output`, mapping its exit code per the
 * testlib convention.
 */
export async function runSpecialCheckerLocal(opts: {
  programSource: string;
  programLanguage: string;
  input: string;
  expected: string;
  actual: string;
  timeoutMs?: number;
}): Promise<SpecialCheckResult> {
  const lang = opts.programLanguage.toLowerCase();
  if (lang !== "c" && lang !== "cpp") {
    throw new Error(
      `Local special-checker backend only supports c/cpp (got "${opts.programLanguage}"); sandboxed checker execution for other languages is a runner backend feature.`
    );
  }

  const key = hashSource(opts.programSource, lang);
  let bin = compiledCache.get(key);
  if (!bin) {
    bin = await compileCLikeChecker(opts.programSource, lang);
    compiledCache.set(key, bin);
  }

  const dir = await mkdtemp(path.join(tmpdir(), "ch-checker-run-"));
  try {
    const inputFile = path.join(dir, "input.txt");
    const expectedFile = path.join(dir, "expected.txt");
    const outputFile = path.join(dir, "output.txt");
    await Promise.all([
      writeFile(inputFile, opts.input, "utf8"),
      writeFile(expectedFile, opts.expected, "utf8"),
      writeFile(outputFile, opts.actual, "utf8"),
    ]);

    const { code, stdout } = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
      const child = spawn(bin!, [inputFile, expectedFile, outputFile], { stdio: ["ignore", "pipe", "ignore"] });
      let out = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs ?? 5000);
      child.stdout.on("data", (b) => (out += b.toString("utf8")));
      child.on("close", (c) => {
        clearTimeout(timer);
        resolve({ code: c, stdout: out });
      });
    });

    if (code === 0) return { verdict: "AC", message: stdout.trim() };
    if (code === 1) return { verdict: "WA", message: stdout.trim() };
    if (code === 2) return { verdict: "PE", message: stdout.trim() };
    return { verdict: "WA", message: stdout.trim() || `checker exited with unexpected code ${code}` };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Test-only: clears the in-process compiled-checker cache. */
export function _clearCheckerCacheForTests(): void {
  compiledCache.clear();
}
