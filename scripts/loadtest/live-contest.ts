/**
 * SSE load test for Phase 7's multiplexed contest stream (docs/phases/
 * PHASE-07-live-contest.md "Load" row: 300 concurrent SSE clients on one
 * contest, server memory stable, diff payloads < 2 KB, no dropped events).
 * Plain Node/`fetch` streaming reader — no k6 dependency, matching
 * scripts/loadtest/contest.ts's shape. Requires a real deployment with
 * `liveContest` on; nothing here has been run against a live one yet —
 * record real numbers in docs/CAPACITY.md once it has.
 *
 * Usage:
 *   npm run loadtest:live -- --base-url http://localhost:3000 \
 *     --cookie "diu_contesthub_session=<token>" --contest-id <id> \
 *     --clients 300 --duration-sec 120
 */

// Forces this file to be treated as its own module scope (it has no other
// imports) so its top-level names don't collide with the other script-mode
// files in this directory that also declare `type Args` / `function main`.
export {};

type LiveArgs = {
  baseUrl: string;
  cookie: string;
  contestId: string;
  clients: number;
  durationSec: number;
};

function parseLiveArgs(): LiveArgs {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback?: string) => {
    const i = args.indexOf(`--${flag}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    baseUrl: get("base-url", "http://localhost:3000")!,
    cookie: get("cookie", "")!,
    contestId: get("contest-id", "")!,
    clients: Number(get("clients", "300")),
    durationSec: Number(get("duration-sec", "120")),
  };
}

type ClientStats = { connected: boolean; bytesReceived: number; events: number; maxEventBytes: number; error?: string };

async function runOneClient(baseUrl: string, cookie: string, contestId: string, durationMs: number): Promise<ClientStats> {
  const stats: ClientStats = { connected: false, bytesReceived: 0, events: 0, maxEventBytes: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), durationMs);

  try {
    const res = await fetch(`${baseUrl}/api/contests/${contestId}/stream`, {
      headers: { Cookie: cookie },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      stats.error = `status ${res.status}`;
      return stats;
    }
    stats.connected = true;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      stats.bytesReceived += value.byteLength;
      buffer += chunk;
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        if (!frame.trim()) continue;
        stats.events += 1;
        stats.maxEventBytes = Math.max(stats.maxEventBytes, Buffer.byteLength(frame, "utf8"));
      }
    }
  } catch (err) {
    if (!(err instanceof Error && err.name === "AbortError")) {
      stats.error = err instanceof Error ? err.message : String(err);
    }
  } finally {
    clearTimeout(timer);
  }
  return stats;
}

async function main() {
  const a = parseLiveArgs();
  if (!a.contestId) {
    console.error("Usage: npm run loadtest:live -- --contest-id <id> --cookie <session cookie> [--clients 300] [--duration-sec 120]");
    process.exit(1);
  }

  console.log(`Opening ${a.clients} SSE connections to contest ${a.contestId} for ${a.durationSec}s...`);
  const startMs = Date.now();
  const results = await Promise.all(
    Array.from({ length: a.clients }, () => runOneClient(a.baseUrl, a.cookie, a.contestId, a.durationSec * 1000))
  );
  const elapsedSec = (Date.now() - startMs) / 1000;

  const connected = results.filter((r) => r.connected).length;
  const failed = results.filter((r) => r.error).length;
  const totalEvents = results.reduce((s, r) => s + r.events, 0);
  const maxEventBytes = Math.max(0, ...results.map((r) => r.maxEventBytes));
  const totalBytes = results.reduce((s, r) => s + r.bytesReceived, 0);

  console.log(`\n=== Contest stream load (${a.clients} clients, ${elapsedSec.toFixed(1)}s) ===`);
  console.log(`connected=${connected}/${a.clients} failed=${failed}`);
  console.log(`total events=${totalEvents} max single-event size=${maxEventBytes}B (pass: < 2048B)`);
  console.log(`total bytes received=${(totalBytes / 1024 / 1024).toFixed(2)}MB`);
  if (failed > 0) {
    for (const r of results.filter((x) => x.error)) console.log(`  error: ${r.error}`);
  }
}

void main();
