import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Sandbox, imageExists } from "../../runner/sandbox.js";
import { judgeTests } from "../../runner/judge.js";

/**
 * Judge conformance suite: one directory per case under tests/golden/cases/,
 * each with main.c, stdin, output (expected stdout) and expected-verdict.
 * Runs the real Docker sandbox (runner/sandbox.js + runner/judge.js) so this
 * exercises the exact code path production uses. Skipped whenever Docker or
 * the sandbox image is unavailable — see docs/phases/PHASE-00-foundation.md
 * Part 2's tier table ("Judge conformance ... no (needs Docker)").
 */

function dockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

const CASES_DIR = path.join(__dirname, "cases");
const CASE_NAMES = readdirSync(CASES_DIR).filter((name) =>
  readFileSync(path.join(CASES_DIR, name, "expected-verdict"), "utf8") !== undefined
);

// Verdicts Phase 0 cannot yet reach — tracked to later phases rather than
// silently skipped, so a suite that starts producing the right verdict is
// forced to fail loudly and get its expectation updated.
const KNOWN_FAILING = new Set(["mle-alloc", "ole-spam"]);

const hasDocker = dockerAvailable();

describe.skipIf(!hasDocker)("judge conformance (Docker sandbox)", () => {
  let sandboxReady = false;

  beforeAll(async () => {
    sandboxReady = await imageExists();
    if (!sandboxReady) {
      console.warn(
        "contest-hub-sandbox image not found — build it with `npm run build:image` in runner/ to run the golden suite."
      );
    }
  }, 30_000);

  for (const name of CASE_NAMES) {
    const dir = path.join(CASES_DIR, name);
    const runCase = async () => {
      const code = readFileSync(path.join(dir, "main.c"), "utf8");
      const stdin = readFileSync(path.join(dir, "stdin"), "utf8");
      const output = readFileSync(path.join(dir, "output"), "utf8");
      const expectedVerdict = readFileSync(path.join(dir, "expected-verdict"), "utf8").trim();

      const box = new Sandbox();
      try {
        await box.start();
        const compiled = await box.compile(code);
        if (!compiled.ok) {
          expect("CE").toBe(expectedVerdict);
          return;
        }
        const { verdict } = await judgeTests(box, [{ input: stdin, output, sample: true }], 5000);
        expect(verdict).toBe(expectedVerdict);
      } finally {
        await box.destroy();
      }
    };

    if (KNOWN_FAILING.has(name)) {
      // Expected to fail until Phase 3 — see the case's main.c for why.
      it.fails(`${name}: known-failing until Phase 3`, async () => {
        if (!sandboxReady) throw new Error("sandbox image unavailable");
        await runCase();
      });
    } else {
      it(name, async () => {
        if (!sandboxReady) return;
        await runCase();
      });
    }
  }
});

afterAll(async () => {
  // Nothing to tear down globally — each case owns its own Sandbox instance.
});
