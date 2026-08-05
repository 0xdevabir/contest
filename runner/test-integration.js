/**
 * Verifies the seam between the web app and the runner: a ticket minted by
 * /api/run-ticket must be accepted by the runner's own verifier.
 */
import WebSocket from "ws";

const APP = process.env.APP_BASE || "http://localhost:3742";

let failures = 0;
function check(label, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

const res = await fetch(`${APP}/api/run-ticket`, { method: "POST" });
const data = await res.json();
check("app issues a run ticket", data.ok === true && !!data.ticket, data.message || "");
check("app reports the runner url", !!data.url, data.url || "");

if (!data.ok) {
  console.log("\ncannot continue without a ticket");
  process.exit(1);
}

const wsUrl = `${data.url.replace(/^http/, "ws")}/ws?ticket=${encodeURIComponent(data.ticket)}`;
const result = await new Promise((resolve) => {
  const ws = new WebSocket(wsUrl);
  let output = "";
  let promptFirst = false;
  const timer = setTimeout(() => {
    ws.close();
    resolve({ output, promptFirst, timedOut: true });
  }, 40_000);

  ws.on("unexpected-response", (_q, r) =>
    resolve({ rejected: true, status: r.statusCode })
  );
  ws.on("error", (e) => resolve({ rejected: true, error: e.message }));

  ws.on("open", () =>
    ws.send(
      JSON.stringify({
        type: "run",
        timeLimitMs: 30_000,
        code: `#include <stdio.h>
int main(){ char name[64]; printf("Your name: "); scanf("%63s", name); printf("Hello, %s!\\n", name); return 0; }`,
      })
    )
  );

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "out") {
      output += msg.data;
      if (!promptFirst && output.includes("Your name:")) {
        promptFirst = true;
        setTimeout(() => ws.send(JSON.stringify({ type: "stdin", data: "Abir\n" })), 60);
      }
    }
    if (msg.type === "exit") {
      clearTimeout(timer);
      ws.close();
      resolve({ output, promptFirst, exit: msg });
    }
  });
});

check("runner accepts the app-minted ticket", !result.rejected, result.status || result.error || "");
check("prompt streamed before input", result.promptFirst === true);
check("interactive round trip works", (result.output || "").includes("Hello, Abir!"), JSON.stringify((result.output || "").slice(-50)));

console.log(`\n${failures ? `${failures} failure(s)` : "all checks passed"}`);
process.exit(failures ? 1 : 0);
