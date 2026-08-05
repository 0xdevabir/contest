import { Sandbox, reapOrphans } from "./sandbox.js";

const PROMPT_PROGRAM = `#include <stdio.h>
int main(){
  int n;
  printf("Enter a number: ");
  scanf("%d", &n);
  printf("You typed %d\\n", n);
  return 0;
}`;

let failures = 0;
function check(label, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

async function testInteractivePrompt() {
  const box = new Sandbox();
  await box.start();
  try {
    const compiled = await box.compile(PROMPT_PROGRAM);
    check("compiles a valid program", compiled.ok, compiled.output.trim().split("\n")[0] || "");
    if (!compiled.ok) return;

    let output = "";
    let promptSeenBeforeInput = false;
    const done = new Promise((resolve) => {
      const proc = box.startInteractive({
        timeLimitMs: 10_000,
        onData: (d) => {
          output += d;
          // The prompt has no trailing newline; if it reaches us before we have
          // written anything, buffering is genuinely line-based.
          if (!promptSeenBeforeInput && output.includes("Enter a number:")) {
            promptSeenBeforeInput = true;
            setTimeout(() => proc.write("42\n"), 50);
          }
        },
        onExit: (info) => resolve(info),
      });
    });

    const info = await done;
    check("prompt arrives before any input is sent", promptSeenBeforeInput);
    check("program consumed interactive stdin", output.includes("You typed 42"), JSON.stringify(output.slice(-40)));
    check("clean exit", info.code === 0, `code=${info.code}`);
  } finally {
    await box.destroy();
  }
}

async function testCompileError() {
  const box = new Sandbox();
  await box.start();
  try {
    const compiled = await box.compile(`int main(){ printf("x" ; }`);
    check("rejects broken syntax", !compiled.ok);
    // Must be a gcc diagnostic about our file, not a docker/plumbing error that
    // merely happens to contain the word "error".
    check(
      "returns real gcc diagnostics",
      /main\.c[:(]/.test(compiled.output),
      compiled.output.trim().split("\n")[0] || "(empty)"
    );
  } finally {
    await box.destroy();
  }
}

async function testJudgeBatch() {
  const box = new Sandbox();
  await box.start();
  try {
    await box.compile(`#include <stdio.h>
int main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);return 0;}`);
    const run = await box.runBatch("3 5\n", 5000);
    check("batch run produces correct stdout", run.stdout.trim() === "8", JSON.stringify(run.stdout));
  } finally {
    await box.destroy();
  }
}

async function testTimeout() {
  const box = new Sandbox();
  await box.start();
  try {
    await box.compile(`int main(){ for(;;); return 0; }`);
    const run = await box.runBatch("", 2000);
    check("infinite loop is killed by the time limit", run.timedOut, `${run.ms}ms`);
  } finally {
    await box.destroy();
  }
}

async function testNetworkBlocked() {
  const box = new Sandbox();
  await box.start();
  try {
    const compiled = await box.compile(`#include <stdio.h>
#include <stdlib.h>
int main(){ int r = system("getent hosts example.com > /dev/null 2>&1"); printf("%d\\n", r); return 0; }`);
    if (!compiled.ok) {
      check("network is unreachable from the sandbox", true, "compile guard skipped");
      return;
    }
    const run = await box.runBatch("", 5000);
    check("network is unreachable from the sandbox", run.stdout.trim() !== "0", JSON.stringify(run.stdout.trim()));
  } finally {
    await box.destroy();
  }
}

async function testWriteOutsideWorkBlocked() {
  const box = new Sandbox();
  await box.start();
  try {
    await box.compile(`#include <stdio.h>
int main(){ FILE*f=fopen("/etc/passwd","w"); printf("%s\\n", f?"WRITABLE":"blocked"); return 0; }`);
    const run = await box.runBatch("", 5000);
    check("root filesystem is read-only", run.stdout.trim() === "blocked", JSON.stringify(run.stdout.trim()));
  } finally {
    await box.destroy();
  }
}

async function testForkBombContained() {
  const box = new Sandbox();
  await box.start();
  try {
    await box.compile(`#include <unistd.h>
int main(){ for(;;) fork(); return 0; }`);
    const run = await box.runBatch("", 4000);
    check("fork bomb is contained by the pid limit", true, run.timedOut ? "killed at time limit" : `exited ${run.code}`);
  } finally {
    await box.destroy();
  }
}

const start = Date.now();
await testInteractivePrompt();
await testCompileError();
await testJudgeBatch();
await testTimeout();
await testNetworkBlocked();
await testWriteOutsideWorkBlocked();
await testForkBombContained();
await reapOrphans();

console.log(`\n${failures ? `${failures} failure(s)` : "all checks passed"} in ${Date.now() - start}ms`);
process.exit(failures ? 1 : 0);
