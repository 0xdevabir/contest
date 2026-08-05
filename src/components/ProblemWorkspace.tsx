"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CodeEditor } from "./CodeEditor";
import { difficultyClass } from "@/lib/difficulty";
import type { JudgeResponse, JudgeVerdict, Problem } from "@/lib/types";

const STORAGE_PREFIX = "contest-hub:code:";
const SOLVED_KEY = "contest-hub:solved";

function loadSolved(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SOLVED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markSolved(id: string) {
  const set = loadSolved();
  set.add(id);
  localStorage.setItem(SOLVED_KEY, JSON.stringify([...set]));
}

function verdictLabel(v: JudgeVerdict): string {
  switch (v) {
    case "AC":
      return "Accepted";
    case "WA":
      return "Wrong Answer";
    case "CE":
      return "Compilation Error";
    case "RE":
      return "Runtime Error";
    case "TLE":
      return "Time Limit Exceeded";
    case "SKIP":
      return "No Auto-Judge";
    default:
      return v;
  }
}

type Props = {
  problem: Problem;
  prevId?: string | null;
  nextId?: string | null;
};

export function ProblemWorkspace({ problem, prevId, nextId }: Props) {
  const [code, setCode] = useState(problem.starterCode);
  const [stdin, setStdin] = useState(problem.sampleInput);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<JudgeResponse | null>(null);
  const [solved, setSolved] = useState(false);
  const [tab, setTab] = useState<"sample" | "custom">("sample");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + problem.id);
    setCode(saved ?? problem.starterCode);
    setStdin(problem.sampleInput);
    setResult(null);
    setSolved(loadSolved().has(problem.id));
  }, [problem.id, problem.starterCode, problem.sampleInput]);

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(STORAGE_PREFIX + problem.id, code);
    }, 400);
    return () => clearTimeout(t);
  }, [code, problem.id]);

  const statusClass = useMemo(() => {
    if (!result) return "";
    if (result.verdict === "AC") return "verdict-ac";
    if (result.verdict === "WA") return "verdict-wa";
    return "verdict-ce";
  }, [result]);

  async function callJudge(mode: "submit" | "run") {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem.id,
          code,
          mode,
          stdin: tab === "custom" || mode === "run" ? stdin : problem.sampleInput,
        }),
      });
      const data = (await res.json()) as JudgeResponse & {
        stdout?: string;
        stderr?: string;
        timeMs?: number;
      };
      setResult(data);
      if (mode === "submit" && data.verdict === "AC") {
        markSolved(problem.id);
        setSolved(true);
      }
    } catch {
      setResult({
        ok: false,
        verdict: "ERROR",
        results: [],
        message: "Network error talking to judge.",
      });
    } finally {
      setBusy(false);
    }
  }

  function resetCode() {
    startTransition(() => {
      setCode(problem.starterCode);
      localStorage.removeItem(STORAGE_PREFIX + problem.id);
      setResult(null);
    });
  }

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 px-4 py-6 lg:grid-cols-2 lg:gap-5 sm:px-6">
      <section className="panel flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <Link href={`/sets/${problem.set}`} className="hover:text-[var(--text)]">
              Set {problem.set}
            </Link>
            <span>/</span>
            <span>Q{problem.question}</span>
            {solved && (
              <span className="ml-2 rounded-md bg-[rgba(62,207,142,0.15)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent)]">
                SOLVED
              </span>
            )}
          </div>
          <h1 className="mt-1 font-display text-2xl font-700 leading-tight">{problem.title}</h1>
          <p
            className={`mt-2 font-mono text-[11px] uppercase tracking-wide ${difficultyClass(problem.difficulty)}`}
          >
            {problem.difficulty} · C · {problem.timeLimitMs}ms
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
          <p className="text-[var(--text)]/90">{problem.statement}</p>

          <div>
            <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--accent)]">
              Input
            </h2>
            <p className="mt-1 text-[var(--muted)]">{problem.input}</p>
          </div>
          <div>
            <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--accent)]">
              Output
            </h2>
            <p className="mt-1 text-[var(--muted)]">{problem.output}</p>
          </div>
          {problem.constraints && (
            <div>
              <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--accent)]">
                Constraints
              </h2>
              <p className="mt-1 font-mono text-xs text-[var(--muted)]">{problem.constraints}</p>
            </div>
          )}

          {!problem.openEnded && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--accent)]">
                  Sample Input
                </h2>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-black/35 p-3 font-mono text-xs">
                  {problem.sampleInput || "(empty)"}
                </pre>
              </div>
              <div>
                <h2 className="font-mono text-xs uppercase tracking-wider text-[var(--accent)]">
                  Sample Output
                </h2>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-black/35 p-3 font-mono text-xs">
                  {problem.sampleOutput || "(empty)"}
                </pre>
              </div>
            </div>
          )}

          {problem.openEnded && (
            <p className="rounded-lg border border-[var(--warn)]/30 bg-[rgba(240,180,41,0.08)] p-3 text-[var(--warn)]">
              Open-ended problem — design your own statement, then use Run with custom input.
              Auto-submit is disabled.
            </p>
          )}
        </div>

        <div className="flex justify-between gap-3 border-t border-[var(--line)] px-5 py-3">
          {prevId ? (
            <Link href={`/problems/${prevId}`} className="btn btn-ghost !py-2 !text-xs">
              ← Prev
            </Link>
          ) : (
            <span />
          )}
          {nextId ? (
            <Link href={`/problems/${nextId}`} className="btn btn-ghost !py-2 !text-xs">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </section>

      <section className="panel flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <div className="font-mono text-xs text-[var(--muted)]">main.c</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost !py-2 !text-xs" onClick={resetCode}>
              Reset
            </button>
            <button
              type="button"
              className="btn btn-ghost !py-2 !text-xs"
              disabled={busy}
              onClick={() => callJudge("run")}
            >
              Run
            </button>
            <button
              type="button"
              className="btn btn-primary !py-2 !text-xs"
              disabled={busy || !!problem.openEnded}
              onClick={() => callJudge("submit")}
            >
              {busy ? <span className="animate-pulse-soft">Judging…</span> : "Submit"}
            </button>
          </div>
        </div>

        <div className="min-h-[280px] flex-1 border-b border-[var(--line)]">
          <CodeEditor value={code} onChange={setCode} />
        </div>

        <div className="border-b border-[var(--line)] px-4 pt-3">
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              className={tab === "sample" ? "text-[var(--accent)]" : "text-[var(--muted)]"}
              onClick={() => {
                setTab("sample");
                setStdin(problem.sampleInput);
              }}
            >
              Sample stdin
            </button>
            <button
              type="button"
              className={tab === "custom" ? "text-[var(--accent)]" : "text-[var(--muted)]"}
              onClick={() => setTab("custom")}
            >
              Custom stdin
            </button>
          </div>
          <textarea
            className="mt-2 mb-3 h-20 w-full resize-y rounded-lg border border-[var(--line)] bg-black/30 p-2 font-mono text-xs outline-none focus:border-[var(--accent-dim)]"
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="max-h-48 overflow-y-auto px-4 py-3">
          {!result && (
            <p className="font-mono text-xs text-[var(--muted)]">
              Write C, then Run (custom I/O) or Submit (sample tests).
            </p>
          )}
          {result && (
            <div className="space-y-2">
              <p className={`font-mono text-sm font-600 ${statusClass}`}>
                {verdictLabel(result.verdict)}
                {result.message ? ` — ${result.message}` : ""}
              </p>
              {result.compileStderr && (
                <pre className="overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] text-[var(--danger)]">
                  {result.compileStderr}
                </pre>
              )}
              {result.stdout != null && (
                <div>
                  <div className="font-mono text-[10px] uppercase text-[var(--muted)]">stdout</div>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px]">
                    {result.stdout || "(empty)"}
                  </pre>
                </div>
              )}
              {result.results?.map((r) => (
                <div key={r.index} className="rounded-lg border border-[var(--line)] p-2 text-xs">
                  <div className="flex justify-between font-mono">
                    <span>
                      Test #{r.index + 1}
                      {r.sample ? " (sample)" : ""}
                    </span>
                    <span
                      className={
                        r.verdict === "AC"
                          ? "verdict-ac"
                          : r.verdict === "WA"
                            ? "verdict-wa"
                            : "verdict-ce"
                      }
                    >
                      {r.verdict} · {r.timeMs}ms
                    </span>
                  </div>
                  {r.verdict === "WA" && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <div className="text-[10px] text-[var(--muted)]">Expected</div>
                        <pre className="mt-0.5 overflow-x-auto bg-black/30 p-1.5">{r.expected}</pre>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--muted)]">Got</div>
                        <pre className="mt-0.5 overflow-x-auto bg-black/30 p-1.5">
                          {r.stdout || "(empty)"}
                        </pre>
                      </div>
                    </div>
                  )}
                  {r.stderr && (
                    <pre className="mt-2 text-[var(--danger)]">{r.stderr}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
          {pending && null}
        </div>
      </section>
    </div>
  );
}
