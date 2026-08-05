import { compileAndJudge, runCustom } from "../src/lib/judge";

const GOOD = `#include <stdio.h>
int main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);return 0;}`;

const BAD = `#include <stdio.h>
int main(){ printf("oops" ; return 0; }`;

async function main() {
  const tests = [
    { input: "3 5", output: "8" },
    { input: "10 20", output: "30" },
  ];

  const ok = await compileAndJudge({ code: GOOD, tests, timeLimitMs: 2000 });
  console.log("correct solution ->", ok.verdict, ok.message ?? "");

  const wrong = await compileAndJudge({
    code: GOOD,
    tests: [{ input: "3 5", output: "9" }],
    timeLimitMs: 2000,
  });
  console.log("wrong answer     ->", wrong.verdict);

  const ce = await compileAndJudge({ code: BAD, tests, timeLimitMs: 2000 });
  console.log("broken syntax    ->", ce.verdict, (ce.compileStderr ?? "").split("\n")[0]);

  const run = await runCustom({ code: GOOD, stdin: "7 8", timeLimitMs: 2000 });
  console.log("run custom stdin ->", run.verdict, JSON.stringify(run.stdout));
}

main().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
