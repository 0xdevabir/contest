import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execSync } from "node:child_process";

function hasLocalCompiler(): boolean {
  const bin = process.platform === "darwin" ? "clang" : "gcc";
  try {
    execSync(`${bin} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("localJudgeAllowed", () => {
  const ORIGINAL_ALLOW = process.env.ALLOW_INSECURE_LOCAL_JUDGE;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (ORIGINAL_ALLOW === undefined) delete process.env.ALLOW_INSECURE_LOCAL_JUDGE;
    else process.env.ALLOW_INSECURE_LOCAL_JUDGE = ORIGINAL_ALLOW;
  });

  it("is false in production without the opt-in — the regression guard for F-1's gate", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ALLOW_INSECURE_LOCAL_JUDGE;
    const { localJudgeAllowed } = await import("./judge");
    expect(localJudgeAllowed()).toBe(false);
  });

  it("is true in production with ALLOW_INSECURE_LOCAL_JUDGE=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ALLOW_INSECURE_LOCAL_JUDGE = "1";
    const { localJudgeAllowed } = await import("./judge");
    expect(localJudgeAllowed()).toBe(true);
  });

  it("is true outside production by default", async () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.ALLOW_INSECURE_LOCAL_JUDGE;
    const { localJudgeAllowed } = await import("./judge");
    expect(localJudgeAllowed()).toBe(true);
  });
});

describe.skipIf(!hasLocalCompiler())("compileAndJudge / runCustom (local compiler path)", () => {
  it("F-1 regression guard: a submitted program cannot read DATABASE_URL from the server env", async () => {
    process.env.DATABASE_URL = "postgresql://should-never-leak:secret@example.invalid/db";
    const { runCustom } = await import("./judge");
    const code = `#include <stdlib.h>
#include <stdio.h>
int main(){ const char* v = getenv("DATABASE_URL"); printf("%s", v ? v : ""); return 0; }`;
    const result = await runCustom({ code, stdin: "", timeLimitMs: 5000 });
    expect(result.verdict).toBe("AC");
    expect(result.stdout).toBe("");
  });

  it("judges a correct solution as AC", async () => {
    const { compileAndJudge } = await import("./judge");
    const code = `#include <stdio.h>
int main(){int a,b; scanf("%d %d",&a,&b); printf("%d\\n", a+b); return 0;}`;
    const result = await compileAndJudge({
      code,
      tests: [{ input: "3 5", output: "8", sample: true }],
      timeLimitMs: 2000,
    });
    expect(result.verdict).toBe("AC");
  });

  it("judges a wrong answer as WA", async () => {
    const { compileAndJudge } = await import("./judge");
    const code = `#include <stdio.h>
int main(){int a,b; scanf("%d %d",&a,&b); printf("%d\\n", a+b); return 0;}`;
    const result = await compileAndJudge({
      code,
      tests: [{ input: "3 5", output: "9", sample: true }],
      timeLimitMs: 2000,
    });
    expect(result.verdict).toBe("WA");
  });

  it("judges broken syntax as CE", async () => {
    const { compileAndJudge } = await import("./judge");
    const code = `#include <stdio.h>\nint main(){ printf("oops" ; return 0; }`;
    const result = await compileAndJudge({
      code,
      tests: [{ input: "3 5", output: "8", sample: true }],
      timeLimitMs: 2000,
    });
    expect(result.verdict).toBe("CE");
  });
});
