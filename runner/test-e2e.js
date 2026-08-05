import { createHmac } from "node:crypto";
import WebSocket from "ws";

const BASE = process.env.RUNNER_BASE || "http://localhost:8080";
const TOKEN = process.env.RUNNER_TOKEN;
if (!TOKEN) {
  console.error("set RUNNER_TOKEN");
  process.exit(1);
}

let failures = 0;
function check(label, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

function ticket(expOffsetMs = 60_000, secret = TOKEN) {
  const payload = Buffer.from(
    JSON.stringify({ sub: "test", exp: Date.now() + expOffsetMs })
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

const PROMPT_PROGRAM = `#include <stdio.h>
int main(){
  int a, b;
  printf("First number: ");
  scanf("%d", &a);
  printf("Second number: ");
  scanf("%d", &b);
  printf("Sum = %d\\n", a + b);
  return 0;
}`;

async function testHealth() {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  check("health endpoint responds", res.status === 200 && data.ok === true);
}

async function testJudgeAuth() {
  const res = await fetch(`${BASE}/judge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "int main(){return 0;}", tests: [] }),
  });
  check("judge rejects a missing token", res.status === 401);
}

async function testJudge() {
  const res = await fetch(`${BASE}/judge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Runner-Token": TOKEN },
    body: JSON.stringify({
      code: `#include <stdio.h>
int main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);return 0;}`,
      tests: [
        { input: "3 5", output: "8" },
        { input: "100 200", output: "300" },
      ],
      timeLimitMs: 5000,
    }),
  });
  const data = await res.json();
  check("judge accepts a correct solution", data.verdict === "AC", `verdict=${data.verdict}`);

  const wrong = await fetch(`${BASE}/judge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Runner-Token": TOKEN },
    body: JSON.stringify({
      code: `#include <stdio.h>
int main(){printf("0\\n");return 0;}`,
      tests: [{ input: "3 5", output: "8" }],
      timeLimitMs: 5000,
    }),
  });
  const wrongData = await wrong.json();
  check("judge flags a wrong answer", wrongData.verdict === "WA", `verdict=${wrongData.verdict}`);
}

function wsSession(ticketValue, onOpenSend) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${BASE.replace(/^http/, "ws")}/ws?ticket=${encodeURIComponent(ticketValue)}`);
    const events = [];
    let output = "";
    let promptsBeforeInput = 0;
    let sentFirst = false;
    let sentSecond = false;

    const timeout = setTimeout(() => {
      ws.close();
      resolve({ events, output, promptsBeforeInput, unauthorized: false, timedOut: true });
    }, 45_000);

    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timeout);
      resolve({ events, output, promptsBeforeInput, unauthorized: res.statusCode === 401 });
    });
    ws.on("error", () => {
      clearTimeout(timeout);
      resolve({ events, output, promptsBeforeInput, unauthorized: true });
    });

    ws.on("open", () => ws.send(JSON.stringify(onOpenSend)));

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      events.push(msg.type);
      if (msg.type === "out") {
        output += msg.data;
        if (!sentFirst && output.includes("First number:")) {
          sentFirst = true;
          promptsBeforeInput++;
          setTimeout(() => ws.send(JSON.stringify({ type: "stdin", data: "12\n" })), 60);
        } else if (sentFirst && !sentSecond && output.includes("Second number:")) {
          sentSecond = true;
          promptsBeforeInput++;
          setTimeout(() => ws.send(JSON.stringify({ type: "stdin", data: "30\n" })), 60);
        }
      }
      if (msg.type === "exit") {
        clearTimeout(timeout);
        ws.close();
        resolve({ events, output, promptsBeforeInput, exit: msg, unauthorized: false });
      }
      if (msg.type === "compile" && msg.ok === false) {
        clearTimeout(timeout);
        ws.close();
        resolve({ events, output, promptsBeforeInput, compileFailed: msg.output, unauthorized: false });
      }
    });
  });
}

async function testInteractive() {
  const r = await wsSession(ticket(), {
    type: "run",
    code: PROMPT_PROGRAM,
    timeLimitMs: 30_000,
  });

  check("websocket run reaches the program", !r.unauthorized && !r.compileFailed, r.compileFailed || "");
  check(
    "both prompts arrived before their input was typed",
    r.promptsBeforeInput === 2,
    `saw ${r.promptsBeforeInput}/2`
  );
  check("program computed from interactive input", r.output.includes("Sum = 42"), JSON.stringify(r.output.slice(-60)));
  check("typed input was echoed back like a real tty", r.output.includes("12"), "");
  check("clean exit reported", r.exit && r.exit.code === 0, `code=${r.exit?.code}`);
}

async function testForgedTicket() {
  const r = await wsSession(ticket(60_000, "wrong-secret"), { type: "run", code: "int main(){}" });
  check("forged ticket is rejected", r.unauthorized === true);
}

async function testExpiredTicket() {
  const r = await wsSession(ticket(-1000), { type: "run", code: "int main(){}" });
  check("expired ticket is rejected", r.unauthorized === true);
}

const start = Date.now();
await testHealth();
await testJudgeAuth();
await testJudge();
await testInteractive();
await testForgedTicket();
await testExpiredTicket();

console.log(`\n${failures ? `${failures} failure(s)` : "all checks passed"} in ${Date.now() - start}ms`);
process.exit(failures ? 1 : 0);
