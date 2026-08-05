import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { Sandbox, imageExists, reapOrphans } from "./sandbox.js";

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.RUNNER_TOKEN || "";
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 12);
const MAX_CODE_BYTES = 100_000;
const DEFAULT_TIME_LIMIT_MS = 10_000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!TOKEN) {
  console.error("RUNNER_TOKEN must be set — refusing to start an open compute endpoint.");
  process.exit(1);
}

let activeSessions = 0;

function tokenMatches(candidate) {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Browsers never see RUNNER_TOKEN. They present a short-lived ticket that the
 * web app signed with the same secret; anything expired or forged is rejected.
 */
function verifyTicket(ticket) {
  if (!ticket) return null;
  const [payload, sig] = ticket.split(".");
  if (!payload || !sig) return null;

  const expected = createHmac("sha256", TOKEN).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
    return { sub: String(data.sub || "anon") };
  } catch {
    return null;
  }
}

function originAllowed(origin) {
  if (!ALLOWED_ORIGINS.length) return true;
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

function normalizeOutput(s) {
  return s.replace(/\r\n/g, "\n").replace(/\s+$/g, "").replace(/[ \t]+$/gm, "");
}

// ---------------------------------------------------------------- HTTP

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, activeSessions, maxSessions: MAX_SESSIONS });
  }

  if (req.method === "POST" && url.pathname === "/judge") {
    if (!tokenMatches(req.headers["x-runner-token"])) {
      return json(res, 401, { ok: false, message: "Unauthorized" });
    }
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > MAX_CODE_BYTES * 3) req.destroy();
    });
    req.on("end", async () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return json(res, 400, { ok: false, message: "Invalid JSON" });
      }
      try {
        const result = await judge(parsed);
        json(res, 200, { ok: true, ...result });
      } catch (err) {
        json(res, 500, { ok: false, message: err.message });
      }
    });
    return undefined;
  }

  return json(res, 404, { ok: false, message: "Not found" });
});

function json(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

/** Batch judging, used by the Next.js app for Submit. */
async function judge({ code, tests, timeLimitMs }) {
  if (typeof code !== "string" || !code || code.length > MAX_CODE_BYTES) {
    return { verdict: "ERROR", results: [], message: "Code missing or too large." };
  }
  if (!Array.isArray(tests) || !tests.length) {
    return { verdict: "SKIP", results: [], message: "No automatic tests for this problem." };
  }
  if (activeSessions >= MAX_SESSIONS) {
    return { verdict: "ERROR", results: [], message: "Judge is busy, try again in a moment." };
  }

  const limit = Math.min(Number(timeLimitMs) || DEFAULT_TIME_LIMIT_MS, 15_000);
  const box = new Sandbox();
  activeSessions++;
  try {
    await box.start();
    const compiled = await box.compile(code);
    if (!compiled.ok) return { verdict: "CE", compileStderr: compiled.output, results: [] };

    const results = [];
    let overall = "AC";

    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      const input = t.input.endsWith("\n") || t.input === "" ? t.input : `${t.input}\n`;
      const run = await box.runBatch(input, limit);

      let verdict = "AC";
      if (run.timedOut) verdict = "TLE";
      else if (run.code !== 0) verdict = "RE";
      else if (normalizeOutput(run.stdout) !== normalizeOutput(t.output)) verdict = "WA";

      results.push({
        index: i,
        verdict,
        timeMs: run.ms,
        stdout: run.stdout,
        stderr: run.stderr,
        expected: t.output,
        sample: t.sample,
      });

      if (verdict !== "AC") {
        overall = verdict;
        break;
      }
    }
    return { verdict: overall, results };
  } finally {
    await box.destroy();
    activeSessions--;
  }
}

// ---------------------------------------------------------------- WebSocket

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/ws") return socket.destroy();
  const ticket = verifyTicket(url.searchParams.get("ticket"));
  if (!ticket) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return socket.destroy();
  }
  if (!originAllowed(req.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws) => {
  let box = null;
  let proc = null;
  let closed = false;

  const send = (msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const idle = setTimeout(() => {
    send({ type: "error", message: "Session idle timeout." });
    ws.close();
  }, IDLE_TIMEOUT_MS);

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(idle);
    if (proc) proc.kill();
    if (box) {
      await box.destroy();
      activeSessions--;
      box = null;
    }
  };

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send({ type: "error", message: "Invalid message" });
    }

    if (msg.type === "run") {
      if (proc) return send({ type: "error", message: "A program is already running." });
      if (typeof msg.code !== "string" || !msg.code || msg.code.length > MAX_CODE_BYTES) {
        return send({ type: "error", message: "Code missing or too large." });
      }
      if (!box && activeSessions >= MAX_SESSIONS) {
        return send({ type: "error", message: "Runner is at capacity, try again shortly." });
      }

      try {
        if (!box) {
          box = new Sandbox();
          activeSessions++;
          send({ type: "status", phase: "starting" });
          await box.start();
        }

        send({ type: "status", phase: "compiling" });
        const compiled = await box.compile(msg.code);
        send({ type: "compile", ok: compiled.ok, output: compiled.output || "" });
        if (!compiled.ok) return undefined;

        send({ type: "status", phase: "running" });
        // Generous ceiling: the clock runs while the student is typing.
        const limit = Math.min(Number(msg.timeLimitMs) || DEFAULT_TIME_LIMIT_MS, 120_000);
        proc = box.startInteractive({
          timeLimitMs: limit,
          onData: (data) => send({ type: "out", data }),
          onExit: (info) => {
            proc = null;
            send({ type: "exit", ...info });
          },
        });
      } catch (err) {
        send({ type: "error", message: err.message });
        await cleanup();
        ws.close();
      }
      return undefined;
    }

    if (msg.type === "stdin") {
      if (proc && typeof msg.data === "string") proc.write(msg.data);
      return undefined;
    }

    if (msg.type === "kill") {
      if (proc) {
        proc.kill();
        proc = null;
      }
      return undefined;
    }

    return send({ type: "error", message: `Unknown message type: ${msg.type}` });
  });

  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

// ---------------------------------------------------------------- boot

const orphans = await reapOrphans();
if (orphans) console.log(`reaped ${orphans} orphaned sandbox container(s)`);

if (!(await imageExists())) {
  console.error(
    "Sandbox image not found. Build it first:\n  npm run build:image"
  );
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`runner listening on :${PORT} (max ${MAX_SESSIONS} sessions)`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await reapOrphans();
    process.exit(0);
  });
}
