import type { JudgeVerdict } from "./types";

/**
 * Judge0 execution backend. Serverless hosts have no C toolchain, so compilation
 * and execution are delegated to a Judge0 instance.
 */

const DEFAULT_URL = "https://ce.judge0.com";
const C_LANGUAGE_ID = 50; // C (GCC 9.2.0)

export type RemoteRun = {
  stdout: string;
  stderr: string;
  compileOutput: string;
  statusId: number;
  timeMs: number;
};

export function remoteJudgeUrl(): string | null {
  const explicit = process.env.JUDGE0_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  // Without a local compiler there is no other way to run code, so fall back to
  // the public instance rather than failing outright.
  if (!hasLocalCompiler()) return DEFAULT_URL;
  return null;
}

export function hasLocalCompiler(): boolean {
  return process.env.VERCEL !== "1" && process.env.AWS_LAMBDA_FUNCTION_NAME == null;
}

function authHeaders(): Record<string, string> {
  const key = process.env.JUDGE0_KEY?.trim();
  if (!key) return {};
  const host = process.env.JUDGE0_HOST?.trim();
  return host
    ? { "X-RapidAPI-Key": key, "X-RapidAPI-Host": host }
    : { "X-Auth-Token": key };
}

/** Judge0 status ids: 3=accepted, 5=TLE, 6=compile error, 7..12=runtime signals. */
export function verdictFromStatus(statusId: number): JudgeVerdict {
  if (statusId === 3) return "AC";
  if (statusId === 5) return "TLE";
  if (statusId === 6) return "CE";
  if (statusId >= 7 && statusId <= 12) return "RE";
  return "ERROR";
}

export async function runRemote(opts: {
  code: string;
  stdin: string;
  timeLimitMs: number;
}): Promise<RemoteRun> {
  const base = remoteJudgeUrl();
  if (!base) throw new Error("No remote judge configured");

  // base64 transport is required: compiler diagnostics are not always valid UTF-8,
  // and Judge0 rejects the whole submission rather than returning partial text.
  const res = await fetch(`${base}/submissions?base64_encoded=true&wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      language_id: C_LANGUAGE_ID,
      source_code: b64encode(opts.code),
      stdin: b64encode(opts.stdin),
      cpu_time_limit: Math.max(1, Math.ceil(opts.timeLimitMs / 1000)),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Judge service returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`
    );
  }

  const data = (await res.json()) as {
    stdout: string | null;
    stderr: string | null;
    compile_output: string | null;
    time: string | null;
    status?: { id: number };
  };

  return {
    stdout: b64decode(data.stdout),
    stderr: b64decode(data.stderr),
    compileOutput: b64decode(data.compile_output),
    statusId: data.status?.id ?? 0,
    timeMs: Math.round(parseFloat(data.time ?? "0") * 1000),
  };
}

function b64encode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function b64decode(s: string | null): string {
  if (!s) return "";
  return Buffer.from(s, "base64").toString("utf8");
}
