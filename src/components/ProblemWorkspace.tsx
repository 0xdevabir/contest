"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Copy,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { difficultyClass } from "@/lib/difficulty";
import type { TerminalHandle } from "./InteractiveTerminal";
import type { JudgeResponse, JudgeVerdict, Problem } from "@/lib/types";
import { clearDraft, loadDraft, loadSolved, markSolved, saveDraft } from "@/lib/progress";

const InteractiveTerminal = dynamic(
  () => import("./InteractiveTerminal").then((m) => m.InteractiveTerminal),
  { ssr: false }
);

const RUNNER_ENABLED = Boolean(process.env.NEXT_PUBLIC_RUNNER_URL);

// Interactive runs are wall-clock bound and include human typing time, so the
// per-problem judging limit would be far too tight here.
const INTERACTIVE_TIME_LIMIT_MS = 60_000;

type Tone = "good" | "bad" | "warn";

const VERDICT: Record<JudgeVerdict, { title: string; hint: string; tone: Tone }> = {
  AC: {
    title: "All tests passed",
    hint: "Nice work — this problem is done.",
    tone: "good",
  },
  WA: {
    title: "Wrong output",
    hint: "Your program ran fine, but printed something different from the expected answer. Compare the two below.",
    tone: "bad",
  },
  CE: {
    title: "Your code did not compile",
    hint: "Read the compiler message below — it names the line to fix.",
    tone: "warn",
  },
  RE: {
    title: "Your program crashed",
    hint: "It stopped part way through. Check array sizes, pointers, and dividing by zero.",
    tone: "warn",
  },
  TLE: {
    title: "Too slow",
    hint: "Your program kept running past the time limit. Try a faster approach.",
    tone: "warn",
  },
  MLE: {
    title: "Used too much memory",
    hint: "Try smaller arrays, or free what you allocate.",
    tone: "warn",
  },
  SKIP: {
    title: "Nothing to check automatically",
    hint: "This problem has no single right answer, so run it and read the output yourself.",
    tone: "warn",
  },
  ERROR: {
    title: "Something went wrong",
    hint: "The judge could not finish. Try again in a moment.",
    tone: "warn",
  },
};

function toneText(tone: Tone) {
  if (tone === "good") return "text-[var(--accent)]";
  if (tone === "bad") return "text-[var(--danger)]";
  return "text-[var(--warn)]";
}

function toneBorder(tone: Tone) {
  if (tone === "good") return "border-[rgba(62,207,142,0.35)] bg-[rgba(62,207,142,0.07)]";
  if (tone === "bad") return "border-[rgba(240,113,120,0.35)] bg-[rgba(240,113,120,0.07)]";
  return "border-[rgba(240,180,41,0.35)] bg-[rgba(240,180,41,0.07)]";
}

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "good") return <CircleCheck size={16} aria-hidden />;
  if (tone === "bad") return <CircleX size={16} aria-hidden />;
  return <CircleAlert size={16} aria-hidden />;
}

/** "MEDIUM-HARD" reads as shouting in body copy; "Medium-hard" does not. */
function prettyDifficulty(d: string) {
  const lower = d.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function prettyLimit(ms: number) {
  return ms % 1000 === 0 ? `${ms / 1000} second${ms === 1000 ? "" : "s"}` : `${ms} ms`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="inline-flex items-center gap-1 text-[11px] text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="eyebrow">{title}</h2>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

type Props = {
  problem: Problem;
  prevId?: string | null;
  nextId?: string | null;
  contestId?: string | null;
  loggedIn?: boolean;
};

export function ProblemWorkspace({
  problem,
  prevId,
  nextId,
  contestId,
  loggedIn = false,
}: Props) {
  const [code, setCode] = useState(problem.starterCode);
  const [stdin, setStdin] = useState(problem.sampleInput);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<JudgeResponse | null>(null);
  const [solved, setSolved] = useState(false);
  const [tab, setTab] = useState<"sample" | "custom">("sample");
  const [panel, setPanel] = useState<"terminal" | "tests">(
    RUNNER_ENABLED ? "terminal" : "tests"
  );
  const [termRunning, setTermRunning] = useState(false);
  const [shortcut, setShortcut] = useState("Ctrl");
  const terminalRef = useRef<TerminalHandle | null>(null);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
      setShortcut("⌘");
    }
  }, []);

  useEffect(() => {
    const saved = loadDraft(problem.id);
    setCode(saved ?? problem.starterCode);
    setStdin(problem.sampleInput);
    setResult(null);
    setSolved(loadSolved().has(problem.id));
  }, [problem.id, problem.starterCode, problem.sampleInput]);

  useEffect(() => {
    const t = setTimeout(() => {
      saveDraft(problem.id, code);
    }, 400);
    return () => clearTimeout(t);
  }, [code, problem.id]);

  const callJudge = useCallback(
    async (mode: "submit" | "run") => {
      if (mode === "submit" && !loggedIn) {
        setPanel("tests");
        setResult({
          ok: false,
          verdict: "ERROR",
          results: [],
          message: "Sign in to submit an answer.",
        });
        return;
      }
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
            contestId: contestId || undefined,
          }),
        });
        const data = (await res.json()) as JudgeResponse;
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
          message: "Could not reach the judge.",
        });
      } finally {
        setBusy(false);
      }
    },
    [code, contestId, loggedIn, problem.id, problem.sampleInput, stdin, tab]
  );

  const handleRun = useCallback(() => {
    if (RUNNER_ENABLED) {
      setPanel("terminal");
      terminalRef.current?.run(code);
      return;
    }
    void callJudge("run");
  }, [callJudge, code]);

  const handleSubmit = useCallback(() => {
    setPanel("tests");
    void callJudge("submit");
  }, [callJudge]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (problem.openEnded) handleRun();
        else handleSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleRun, handleSubmit, problem.openEnded]);

  function resetCode() {
    startTransition(() => {
      setCode(problem.starterCode);
      clearDraft(problem.id);
      setResult(null);
    });
  }

  const verdict = result ? VERDICT[result.verdict] ?? VERDICT.ERROR : null;
  const passed = useMemo(
    () => (result?.results ?? []).filter((r) => r.verdict === "AC").length,
    [result]
  );
  const totalTests = result?.results?.length ?? 0;
  const loginHref = `/login?next=${encodeURIComponent(
    `/problems/${problem.id}${contestId ? `?contest=${contestId}` : ""}`
  )}`;

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:gap-5">
      {/* ---------------- the question ---------------- */}
      <section className="panel flex flex-col overflow-hidden lg:h-[calc(100dvh-6.25rem)]">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
            <Link href={`/sets/${problem.set}`} className="hover:text-[var(--text)]">
              Set {problem.set}
            </Link>
            <span aria-hidden>·</span>
            <span>Question {problem.question}</span>
            {solved && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-[rgba(62,207,142,0.15)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                <Check size={11} aria-hidden />
                Solved
              </span>
            )}
          </div>

          <h1 className="font-display mt-2 text-2xl leading-tight font-bold">{problem.title}</h1>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--muted)]">
            <span className={`font-medium ${difficultyClass(problem.difficulty)}`}>
              {prettyDifficulty(problem.difficulty)}
            </span>
            <span aria-hidden>·</span>
            <span>Written in C</span>
            <span aria-hidden>·</span>
            <span>Must finish in {prettyLimit(problem.timeLimitMs)}</span>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 text-sm leading-relaxed">
          <p className="text-[15px] text-[var(--text)]/90">{problem.statement}</p>

          <Block title="What your program reads">
            <p className="text-[var(--muted)]">{problem.input}</p>
          </Block>

          <Block title="What your program prints">
            <p className="text-[var(--muted)]">{problem.output}</p>
          </Block>

          {problem.constraints && (
            <Block title="Limits">
              <p className="font-mono text-xs text-[var(--muted)]">{problem.constraints}</p>
            </Block>
          )}

          {!problem.openEnded && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="eyebrow">Example input</h2>
                  <CopyButton text={problem.sampleInput} label="example input" />
                </div>
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-black/35 p-3 font-mono text-xs">
                  {problem.sampleInput || "(nothing to read)"}
                </pre>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="eyebrow">Expected output</h2>
                  <CopyButton text={problem.sampleOutput} label="expected output" />
                </div>
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-black/35 p-3 font-mono text-xs">
                  {problem.sampleOutput || "(nothing to print)"}
                </pre>
              </div>
            </div>
          )}

          {problem.openEnded && (
            <p className="rounded-lg border border-[var(--warn)]/30 bg-[rgba(240,180,41,0.08)] p-3 text-[13px] text-[var(--warn)]">
              This one is open-ended: there is no fixed answer to check. Write your program, press
              Run, and read the output yourself.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3">
          {prevId ? (
            <Link href={`/problems/${prevId}`} className="btn btn-ghost !px-3 !py-2 !text-xs">
              <ArrowLeft size={14} aria-hidden />
              Previous
            </Link>
          ) : (
            <span />
          )}
          {nextId ? (
            <Link href={`/problems/${nextId}`} className="btn btn-ghost !px-3 !py-2 !text-xs">
              Next problem
              <ArrowRight size={14} aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </div>
      </section>

      {/* ---------------- the editor ---------------- */}
      <section className="panel flex min-h-[70vh] flex-col overflow-hidden lg:h-[calc(100dvh-6.25rem)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <div className="font-mono text-xs text-[var(--muted)]">main.c</div>
            <p className="mt-0.5 text-[11px] text-[var(--muted-dim)]">
              Your work is saved in this browser as you type.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost !px-3 !py-2 !text-xs"
              onClick={resetCode}
              title="Go back to the starter code"
            >
              <RotateCcw size={13} aria-hidden />
              Start over
            </button>
            {termRunning ? (
              <button
                type="button"
                className="btn btn-ghost !px-3 !py-2 !text-xs !text-[var(--danger)]"
                onClick={() => terminalRef.current?.stop()}
              >
                <Square size={13} aria-hidden />
                Stop
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost !px-3 !py-2 !text-xs"
                disabled={busy}
                onClick={handleRun}
                title="Run your code on the input below without grading it"
              >
                <Play size={13} aria-hidden />
                Run
              </button>
            )}
            {loggedIn ? (
              <button
                type="button"
                className="btn btn-primary !px-3.5 !py-2 !text-xs"
                disabled={busy || termRunning || !!problem.openEnded}
                onClick={handleSubmit}
                title={
                  problem.openEnded
                    ? "This problem has no fixed answer to check"
                    : contestId
                      ? `Send this to the contest scoreboard (${shortcut} + Enter)`
                      : `Check against every test (${shortcut} + Enter)`
                }
              >
                {busy ? <span className="animate-pulse-soft">Submitting…</span> : "Submit"}
              </button>
            ) : (
              <Link
                href={loginHref}
                className="btn btn-primary !px-3.5 !py-2 !text-xs"
                title="Sign in to submit an answer"
              >
                Sign in to submit
              </Link>
            )}
          </div>
        </div>

        <div className="min-h-[340px] flex-1 border-b border-[var(--line)]">
          <CodeEditor value={code} onChange={setCode} />
        </div>

        {RUNNER_ENABLED && (
          <div className="flex items-center gap-4 border-b border-[var(--line)] px-4 py-2 text-xs">
            <button
              type="button"
              className={
                panel === "terminal"
                  ? "font-medium text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }
              onClick={() => setPanel("terminal")}
            >
              Program output
            </button>
            <button
              type="button"
              className={
                panel === "tests"
                  ? "font-medium text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }
              onClick={() => setPanel("tests")}
            >
              Test results
            </button>
          </div>
        )}

        {RUNNER_ENABLED && (
          <div className={panel === "terminal" ? "h-56 border-b border-[var(--line)]" : "hidden"}>
            <InteractiveTerminal
              ref={terminalRef}
              timeLimitMs={INTERACTIVE_TIME_LIMIT_MS}
              onRunningChange={setTermRunning}
            />
          </div>
        )}

        {!RUNNER_ENABLED && (
          <div className="shrink-0 border-b border-[var(--line)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="eyebrow">Input for Run</span>
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  className={
                    tab === "sample"
                      ? "rounded-md bg-[rgba(62,207,142,0.14)] px-2 py-1 font-medium text-[var(--accent)]"
                      : "rounded-md px-2 py-1 text-[var(--muted)] hover:text-[var(--text)]"
                  }
                  onClick={() => {
                    setTab("sample");
                    setStdin(problem.sampleInput);
                  }}
                >
                  Use the example
                </button>
                <button
                  type="button"
                  className={
                    tab === "custom"
                      ? "rounded-md bg-[rgba(62,207,142,0.14)] px-2 py-1 font-medium text-[var(--accent)]"
                      : "rounded-md px-2 py-1 text-[var(--muted)] hover:text-[var(--text)]"
                  }
                  onClick={() => setTab("custom")}
                >
                  Type my own
                </button>
              </div>
            </div>
            <textarea
              aria-label="Input given to your program when you press Run"
              className="mt-2 h-16 w-full resize-y rounded-lg border border-[var(--line)] bg-black/30 p-2 font-mono text-xs outline-none focus:border-[var(--accent-dim)]"
              value={stdin}
              onChange={(e) => {
                setTab("custom");
                setStdin(e.target.value);
              }}
              spellCheck={false}
            />
          </div>
        )}

        <div
          aria-live="polite"
          className={
            // Sizes to its content and scrolls past the cap, rather than
            // claiming half the column to hold three lines of help text.
            panel === "tests" || !RUNNER_ENABLED
              ? "max-h-[42%] shrink-0 overflow-y-auto px-4 py-3"
              : "hidden"
          }
        >
          {!result && (
            <div className="text-xs leading-relaxed text-[var(--muted)]">
              <p>
                <span className="text-[var(--text)]">Run</span> tries your code on the input above
                and shows what it prints.{" "}
                <span className="text-[var(--text)]">Submit</span> checks your output against every
                test, including hidden ones
                {loggedIn ? "." : " — sign in first so your result is saved."}
              </p>
              {!loggedIn && (
                <p className="mt-1.5">
                  <Link href={loginHref} className="text-[var(--accent)] hover:underline">
                    Sign in to submit
                  </Link>
                  {" · "}
                  <Link
                    href={`/register?next=${encodeURIComponent(
                      `/problems/${problem.id}${contestId ? `?contest=${contestId}` : ""}`
                    )}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    Create an account
                  </Link>
                </p>
              )}
              {contestId && (
                <p className="mt-1.5 text-[var(--warn)]">
                  This is a contest: every wrong submission on a problem you later solve adds
                  penalty time, so run it first.
                </p>
              )}
              <p className="mt-1.5 text-[var(--muted-dim)]">
                Shortcut: {shortcut} + Enter{" "}
                {loggedIn ? "sends it to the judge." : "submits once you are signed in."}
              </p>
            </div>
          )}

          {result && !result.ok && !result.verdict && (
            <div className="rounded-lg border border-[var(--warn)]/40 bg-[rgba(240,180,41,0.08)] p-3 text-xs text-[var(--warn)]">
              <p>{result.message || "Something went wrong."}</p>
              {/sign in/i.test(result.message || "") && (
                <p className="mt-2">
                  <Link href={loginHref} className="font-medium text-[var(--accent)] hover:underline">
                    Sign in
                  </Link>
                  {" to continue."}
                </p>
              )}
            </div>
          )}

          {result && verdict && (
            <div className="space-y-3">
              <div className={`rounded-lg border p-3 ${toneBorder(verdict.tone)}`}>
                <p
                  className={`flex items-center gap-2 text-sm font-semibold ${toneText(verdict.tone)}`}
                >
                  <ToneIcon tone={verdict.tone} />
                  {/sign in/i.test(result.message || "") ? "Sign in required" : verdict.title}
                  {totalTests > 0 && (
                    <span className="tnum ml-auto text-xs font-normal text-[var(--muted)]">
                      {passed} of {totalTests} tests passed
                    </span>
                  )}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                  {result.message || verdict.hint}
                </p>
                {/sign in/i.test(result.message || "") && (
                  <p className="mt-2 text-xs">
                    <Link href={loginHref} className="text-[var(--accent)] hover:underline">
                      Sign in
                    </Link>
                    {" · "}
                    <Link
                      href={`/register?next=${encodeURIComponent(
                        `/problems/${problem.id}${contestId ? `?contest=${contestId}` : ""}`
                      )}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      Create an account
                    </Link>
                  </p>
                )}
              </div>

              {result.compileStderr && (
                <div>
                  <div className="eyebrow">Compiler message</div>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] text-[var(--danger)]">
                    {result.compileStderr}
                  </pre>
                </div>
              )}

              {result.stdout != null && (
                <div>
                  <div className="eyebrow">What your program printed</div>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px]">
                    {result.stdout || "(nothing)"}
                  </pre>
                </div>
              )}

              {result.results?.map((r) => {
                const rowTone: Tone =
                  r.verdict === "AC" ? "good" : r.verdict === "WA" ? "bad" : "warn";
                return (
                  <div
                    key={r.index}
                    className="rounded-lg border border-[var(--line)] p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        Test {r.index + 1}
                        <span className="text-[11px] text-[var(--muted-dim)]">
                          {r.sample ? "from the example" : "hidden"}
                        </span>
                      </span>
                      <span className={`tnum flex items-center gap-1.5 ${toneText(rowTone)}`}>
                        <ToneIcon tone={rowTone} />
                        {r.verdict === "AC" ? "Passed" : VERDICT[r.verdict]?.title || r.verdict}
                        <span className="text-[var(--muted-dim)]">{r.timeMs} ms</span>
                      </span>
                    </div>
                    {r.verdict === "WA" && (
                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                        <div>
                          <div className="text-[10px] text-[var(--muted)]">Expected</div>
                          <pre className="mt-0.5 overflow-x-auto rounded-md bg-black/30 p-1.5 font-mono">
                            {r.expected}
                          </pre>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--muted)]">Your output</div>
                          <pre className="mt-0.5 overflow-x-auto rounded-md bg-black/30 p-1.5 font-mono">
                            {r.stdout || "(nothing)"}
                          </pre>
                        </div>
                      </div>
                    )}
                    {r.stderr && (
                      <pre className="mt-2 overflow-x-auto font-mono text-[var(--danger)]">
                        {r.stderr}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {pending && null}
        </div>
      </section>
    </div>
  );
}



