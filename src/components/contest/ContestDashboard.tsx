"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Verdict } from "@prisma/client";
import {
  Check,
  ChevronRight,
  CircleDot,
  Flame,
  Lock,
  RefreshCw,
  Search,
  Snowflake,
  Trophy,
  X,
} from "lucide-react";
import type {
  ContestDashboardData,
  ContestProblemStat,
  ScoreboardRow,
} from "@/lib/contest-dashboard";
import { UNIVERSITIES, universityLabel } from "@/lib/universities";
import { ContestCountdown, formatMinutes, useServerClock } from "./ContestClock";
import { ContestRegisterButton } from "@/components/ContestRegisterButton";

const REFRESH_MS = 30_000;

type Rules = {
  penaltyPerWrong: number;
  freezeMinutes: number;
  maxSubmissionsPerProblem: number;
  languages: string[];
  notes: string;
  allowPracticeAfter: boolean;
};

type Props = {
  contestId: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  data: ContestDashboardData;
  rules: Rules;
  registered: boolean;
  loggedIn: boolean;
  viewerId: string | null;
  initialUni: string | null;
};

type TabId = "problems" | "standings" | "runs" | "rules";

export function ContestDashboard({
  contestId,
  title,
  description,
  durationMinutes,
  data,
  rules,
  registered,
  loggedIn,
  viewerId,
  initialUni,
}: Props) {
  const [tab, setTab] = useState<TabId>("problems");
  const running = data.phase === "RUNNING";
  const locked = data.phase === "BEFORE" || (running && !registered);

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: "problems", label: "Problems", count: data.problems.length },
    { id: "standings", label: "Standings", count: data.totals.participants },
    { id: "runs", label: "My runs", count: data.mySubmissions.length },
    { id: "rules", label: "Rules" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-6 sm:px-6 sm:py-8">
      <ExamBar
        contestId={contestId}
        title={title}
        data={data}
        registered={registered}
        loggedIn={loggedIn}
        running={running}
      />

      <nav
        className="mt-6 flex gap-1 overflow-x-auto border-b border-[var(--line)] pb-px"
        aria-label="Contest sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
              tab === t.id
                ? "border-[var(--accent)] text-[var(--text)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 font-mono text-[11px] text-[var(--muted)]">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "problems" && (
          <ProblemBoard
            contestId={contestId}
            data={data}
            locked={locked}
            registered={registered}
            loggedIn={loggedIn}
            allowPracticeAfter={rules.allowPracticeAfter}
          />
        )}
        {tab === "standings" && (
          <Standings data={data} viewerId={viewerId} initialUni={initialUni} />
        )}
        {tab === "runs" && <MyRuns data={data} loggedIn={loggedIn} />}
        {tab === "rules" && (
          <RulesPanel
            rules={rules}
            data={data}
            durationMinutes={durationMinutes}
            description={description}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------- exam bar ---------------- */

function ExamBar({
  contestId,
  title,
  data,
  registered,
  loggedIn,
  running,
}: {
  contestId: string;
  title: string;
  data: ContestDashboardData;
  registered: boolean;
  loggedIn: boolean;
  running: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncedAt, setSyncedAt] = useState(data.serverNowMs);
  const now = useServerClock(data.serverNowMs);

  useEffect(() => setSyncedAt(data.serverNowMs), [data.serverNowMs]);

  const refresh = useMemo(
    () => () => startTransition(() => router.refresh()),
    [router]
  );

  // Standings move under you during a live contest, so keep pulling — but only
  // while it is actually running, and only when the tab is visible.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [running, refresh]);

  const agoSec = Math.max(0, Math.round((now - syncedAt) / 1000));
  const viewer = data.viewer;

  // Pinned below the site header on wide screens so the clock stays in view. On
  // narrow screens the bar is too tall to pin without eating the viewport.
  return (
    <header className="panel overflow-hidden p-4 backdrop-blur sm:p-5 lg:sticky lg:top-[calc(3.25rem+0.5rem)] lg:z-30">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PhasePill phase={data.phase} />
            {data.frozen && (
              <span className="badge border-[var(--warn-border)] bg-[var(--warn-surface)] text-[var(--warn)]">
                <Snowflake size={11} aria-hidden="true" />
                Frozen
              </span>
            )}
            {registered && (
              <span className="badge border-[var(--accent-border)] bg-[var(--accent-surface)] text-[var(--accent)]">
                You joined
              </span>
            )}
          </div>
          <h1 className="mt-2 truncate font-display text-xl font-bold sm:text-2xl">
            {title}
          </h1>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <ContestCountdown
            phase={data.phase}
            startsAtMs={data.startsAtMs}
            endsAtMs={data.endsAtMs}
            serverNowMs={data.serverNowMs}
            freezeAtMs={data.freezeAtMs}
          />

          <div className="flex items-center gap-2.5">
            <ScoreChip
              label="Rank"
              value={viewer ? `#${viewer.rank}` : "—"}
              sub={`of ${data.totals.participants}`}
            />
            <ScoreChip
              label="Solved"
              value={`${viewer?.solved ?? data.totals.solvedByViewer}`}
              sub={`of ${data.problems.length}`}
              accent
            />
            <ScoreChip label="Penalty" value={`${viewer?.penalty ?? 0}`} sub="min" />
          </div>

          <div className="flex items-center gap-2">
            {running && (
              <ContestRegisterButton
                contestId={contestId}
                registered={registered}
                loggedIn={loggedIn}
              />
            )}
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              title={`Updated ${agoSec}s ago`}
              className="btn btn-ghost !px-2.5 !py-2 !text-xs"
              aria-label="Refresh contest data"
            >
              <RefreshCw
                size={13}
                aria-hidden="true"
                className={pending ? "animate-spin" : ""}
              />
              <span className="hidden font-mono sm:inline">{agoSec}s</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function PhasePill({ phase }: { phase: ContestDashboardData["phase"] }) {
  if (phase === "RUNNING") {
    return (
      <span className="badge border-[var(--accent-border)] bg-[var(--accent-surface)] text-[var(--accent)]">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        </span>
        Live now
      </span>
    );
  }
  if (phase === "BEFORE") {
    return (
      <span className="badge border-[var(--warn-border)] bg-[var(--warn-surface)] text-[var(--warn)]">
        Not started
      </span>
    );
  }
  return <span className="badge text-[var(--muted)]">Finished</span>;
}

function ScoreChip({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--sunken)] px-2.5 py-1.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`font-mono text-base font-bold tabular-nums ${
          accent ? "text-[var(--accent)]" : "text-[var(--text)]"
        }`}
      >
        {value}
        {sub && <span className="ml-1 text-[10px] font-normal text-[var(--muted)]">{sub}</span>}
      </p>
    </div>
  );
}

/* ---------------- problems ---------------- */

function ProblemBoard({
  contestId,
  data,
  locked,
  registered,
  loggedIn,
  allowPracticeAfter,
}: {
  contestId: string;
  data: ContestDashboardData;
  locked: boolean;
  registered: boolean;
  loggedIn: boolean;
  allowPracticeAfter: boolean;
}) {
  const solvedTotal = data.problems.filter((p) => p.mine?.solved).length;
  const pct = data.problems.length
    ? Math.round((solvedTotal / data.problems.length) * 100)
    : 0;

  return (
    <div>
      {loggedIn && (
        <div className="panel-quiet mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <div className="min-w-[9rem] flex-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-[var(--muted)]">Your progress</span>
              <span className="font-mono text-xs text-[var(--text)]">
                {solvedTotal}/{data.problems.length} · {pct}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--sunken)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {data.problems.map((p) => (
              <span
                key={p.problemId}
                title={`${p.label} — ${p.title}`}
                className={`flex h-6 w-6 items-center justify-center rounded font-mono text-[10px] font-bold ${
                  p.mine?.solved
                    ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                    : p.mine?.attempts
                      ? "bg-[var(--danger-surface)] text-[var(--danger)]"
                      : "bg-[var(--sunken)] text-[var(--muted)]"
                }`}
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {locked && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--warn-border)] bg-[var(--warn-surface)] px-3.5 py-2.5 text-sm text-[var(--warn)]">
          <Lock size={14} aria-hidden="true" />
          {data.phase === "BEFORE"
            ? "Problems unlock the moment the contest starts."
            : loggedIn
              ? "Register above to open the contest problems."
              : "Sign in and register to open the contest problems."}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.problems.map((p) => (
          <ProblemCard
            key={p.problemId}
            problem={p}
            contestId={contestId}
            phase={data.phase}
            participants={data.totals.participants}
            registered={registered}
            allowPracticeAfter={allowPracticeAfter}
          />
        ))}
      </div>
    </div>
  );
}

function ProblemCard({
  problem,
  contestId,
  phase,
  participants,
  registered,
  allowPracticeAfter,
}: {
  problem: ContestProblemStat;
  contestId: string;
  phase: ContestDashboardData["phase"];
  participants: number;
  registered: boolean;
  allowPracticeAfter: boolean;
}) {
  const href =
    phase === "RUNNING" && registered
      ? `/problems/${problem.problemId}?contest=${contestId}`
      : phase === "ENDED" && allowPracticeAfter
        ? `/problems/${problem.problemId}`
        : null;

  const solved = problem.mine?.solved ?? false;
  const attempts = problem.mine?.attempts ?? 0;
  const solveRate = participants
    ? Math.round((problem.solvedCount / participants) * 100)
    : 0;

  const body = (
    <>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-base font-bold ${
            solved
              ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
              : attempts
                ? "bg-[var(--danger-surface)] text-[var(--danger)]"
                : "bg-[var(--sunken)] text-[var(--muted)]"
          }`}
        >
          {problem.label}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-snug">{problem.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-[var(--muted)]">
            <span className="text-[var(--accent)]">{problem.points} pts</span>
            {problem.difficulty && <span>· {problem.difficulty}</span>}
            {problem.topic && <span className="truncate">· {problem.topic}</span>}
          </div>
        </div>
        {href && (
          <ChevronRight size={16} className="mt-1 shrink-0 text-[var(--muted)]" aria-hidden="true" />
        )}
      </div>

      <div className="mt-3.5 flex items-center gap-2 text-xs">
        {solved ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--accent)]">
            <Check size={13} aria-hidden="true" />
            Solved
            {problem.mine?.solvedAtMin !== null && problem.mine !== null && (
              <span className="font-mono text-[var(--muted)]">
                at {formatMinutes(problem.mine.solvedAtMin!)}
              </span>
            )}
          </span>
        ) : attempts ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--danger)]">
            <X size={13} aria-hidden="true" />
            {attempts} failed {attempts === 1 ? "attempt" : "attempts"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
            <CircleDot size={13} aria-hidden="true" />
            Not attempted
          </span>
        )}
      </div>

      <div className="mt-3 border-t border-[var(--line)] pt-3">
        <div className="flex items-baseline justify-between font-mono text-[11px] text-[var(--muted)]">
          <span>
            {problem.solvedCount}/{participants} solved
          </span>
          <span>{solveRate}%</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--sunken)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] opacity-70"
            style={{ width: `${solveRate}%` }}
          />
        </div>
        {problem.firstSolver && (
          <p className="mt-2 flex items-center gap-1.5 truncate font-mono text-[11px] text-[var(--warn)]">
            <Flame size={11} aria-hidden="true" />
            First: {problem.firstSolver.name} at {formatMinutes(problem.firstSolver.atMin)}
          </p>
        )}
      </div>
    </>
  );

  if (!href) {
    return (
      <div className="panel p-4 opacity-70">
        {body}
        <p className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-[var(--muted)]">
          <Lock size={11} aria-hidden="true" />
          {phase === "ENDED" ? "Closed for practice" : "Locked"}
        </p>
      </div>
    );
  }

  return (
    <Link href={href} className="panel panel-hover block p-4">
      {body}
    </Link>
  );
}

/* ---------------- standings ---------------- */

function Standings({
  data,
  viewerId,
  initialUni,
}: {
  data: ContestDashboardData;
  viewerId: string | null;
  initialUni: string | null;
}) {
  const [uni, setUni] = useState(initialUni ?? "");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter(
      (r) =>
        (!uni || r.university === uni) &&
        (!q || r.name.toLowerCase().includes(q))
    );
  }, [data.rows, uni, query]);

  const viewerVisible = rows.some((r) => r.userId === viewerId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={13}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find contestant"
            aria-label="Find contestant"
            className="w-48 rounded-lg border border-[var(--line)] bg-[var(--sunken)] py-1.5 pl-7 pr-2.5 text-xs outline-none focus:border-[var(--accent-border)]"
          />
        </div>
        <Chip active={!uni} onClick={() => setUni("")} label="All campuses" />
        {UNIVERSITIES.map((u) => (
          <Chip
            key={u.code}
            active={uni === u.code}
            onClick={() => setUni(u.code)}
            label={u.shortName}
          />
        ))}
      </div>

      {data.frozen && (
        <p className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--warn-border)] bg-[var(--warn-surface)] px-3.5 py-2.5 text-sm text-[var(--warn)]">
          <Snowflake size={14} aria-hidden="true" />
          Scoreboard frozen for the final stretch. Your own runs still count — you
          just cannot see how everyone else is doing.
        </p>
      )}

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--sunken)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2.5 text-center font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">Contestant</th>
                <th className="px-3 py-2.5 text-right font-semibold">Solved</th>
                <th className="px-3 py-2.5 text-right font-semibold">Penalty</th>
                {data.problems.map((p) => (
                  <th
                    key={p.problemId}
                    className="w-14 px-1 py-2.5 text-center font-mono text-xs font-semibold text-[var(--text)]"
                    title={p.title}
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4 + data.problems.length}
                    className="px-4 py-12 text-center text-[var(--muted)]"
                  >
                    No contestants match this filter yet.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <StandingRow
                  key={row.userId}
                  row={row}
                  problems={data.problems}
                  isViewer={row.userId === viewerId}
                />
              ))}
            </tbody>
            {data.viewer && !viewerVisible && (
              <tfoot className="border-t-2 border-[var(--accent-border)]">
                <StandingRow row={data.viewer} problems={data.problems} isViewer />
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <Legend />
    </div>
  );
}

function StandingRow({
  row,
  problems,
  isViewer,
}: {
  row: ScoreboardRow;
  problems: ContestProblemStat[];
  isViewer: boolean;
}) {
  return (
    <tr className={isViewer ? "bg-[var(--accent-surface)]" : undefined}>
      <td className="px-3 py-2.5 text-center font-mono text-sm">
        {row.rank <= 3 && row.solved > 0 ? (
          <span className="inline-flex items-center gap-1 font-bold text-[var(--accent)]">
            <Trophy size={11} aria-hidden="true" />
            {row.rank}
          </span>
        ) : (
          <span className="text-[var(--muted)]">{row.rank}</span>
        )}
      </td>
      <td className="max-w-[14rem] px-3 py-2.5">
        <span className="block truncate font-medium">
          {row.name}
          {isViewer && (
            <span className="ml-1.5 font-mono text-[10px] text-[var(--accent)]">you</span>
          )}
        </span>
        <span className="block truncate text-[11px] text-[var(--muted)]">
          {row.university ? universityLabel(row.university) : "—"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono font-bold">{row.solved}</td>
      <td className="px-3 py-2.5 text-right font-mono text-[var(--muted)]">{row.penalty}</td>
      {problems.map((p) => (
        <Cell key={p.problemId} cell={row.cells[p.problemId]} />
      ))}
    </tr>
  );
}

function Cell({ cell }: { cell: ScoreboardRow["cells"][string] | undefined }) {
  if (!cell || (!cell.solved && cell.attempts === 0)) {
    return <td className="px-1 py-2.5 text-center font-mono text-xs text-[var(--muted)]">·</td>;
  }
  if (cell.solved) {
    return (
      <td className="px-1 py-1.5 text-center">
        <span
          className={`inline-flex min-w-[2.5rem] flex-col rounded px-1 py-0.5 font-mono text-[11px] font-bold leading-tight ${
            cell.firstBlood
              ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
              : "bg-[var(--accent-surface)] text-[var(--accent)]"
          }`}
        >
          <span>+{cell.attempts || ""}</span>
          <span className="font-normal opacity-80">
            {cell.solvedAtMin !== null ? formatMinutes(cell.solvedAtMin) : ""}
          </span>
        </span>
      </td>
    );
  }
  return (
    <td className="px-1 py-1.5 text-center">
      <span className="inline-block min-w-[2.5rem] rounded bg-[var(--danger-surface)] px-1 py-0.5 font-mono text-[11px] font-bold text-[var(--danger)]">
        −{cell.attempts}
      </span>
    </td>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-[var(--muted)]">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded bg-[var(--accent)]" />
        first to solve
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded bg-[var(--accent-surface)]" />
        solved (+ retries, minute)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded bg-[var(--danger-surface)]" />
        attempted, unsolved
      </span>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
        active
          ? "border-[var(--accent-border)] bg-[var(--accent-surface)] text-[var(--accent)]"
          : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );
}

/* ---------------- my runs ---------------- */

const VERDICT_LABEL: Record<Verdict, string> = {
  AC: "Accepted",
  WA: "Wrong answer",
  CE: "Compile error",
  RE: "Runtime error",
  TLE: "Time limit",
  MLE: "Memory limit",
  SKIP: "Not judged",
  ERROR: "Judge error",
};

function verdictTone(verdict: Verdict) {
  if (verdict === "AC") {
    return "border-[var(--accent-border)] bg-[var(--accent-surface)] text-[var(--accent)]";
  }
  if (verdict === "CE" || verdict === "SKIP" || verdict === "ERROR") {
    return "border-[var(--warn-border)] bg-[var(--warn-surface)] text-[var(--warn)]";
  }
  return "border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--danger)]";
}

function MyRuns({ data, loggedIn }: { data: ContestDashboardData; loggedIn: boolean }) {
  if (!loggedIn) {
    return <Empty text="Sign in to see the runs you made in this contest." />;
  }
  if (data.mySubmissions.length === 0) {
    return <Empty text="No submissions yet. Open a problem and send your first run." />;
  }

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--sunken)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Problem</th>
              <th className="px-4 py-2.5 font-semibold">Verdict</th>
              <th className="px-4 py-2.5 text-right font-semibold">Contest time</th>
              <th className="px-4 py-2.5 text-right font-semibold">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {data.mySubmissions.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-[var(--accent)]">{s.label}</span>
                  <span className="ml-2.5">{s.title}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`badge ${verdictTone(s.verdict)}`}>
                    {VERDICT_LABEL[s.verdict]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[var(--muted)]">
                  {formatMinutes(s.atMin)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-[var(--muted)]">
                  <LocalTime ms={s.createdAtMs} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Renders after mount so the server's timezone never disagrees with the browser. */
function LocalTime({ ms }: { ms: number }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText(new Date(ms).toLocaleTimeString());
  }, [ms]);
  return <span suppressHydrationWarning>{text || "—"}</span>;
}

/* ---------------- rules ---------------- */

function RulesPanel({
  rules,
  data,
  durationMinutes,
  description,
}: {
  rules: Rules;
  data: ContestDashboardData;
  durationMinutes: number;
  description: string | null;
}) {
  const items: Array<[string, string]> = [
    ["Duration", `${durationMinutes} minutes`],
    ["Problems", `${data.problems.length}`],
    ["Total points", `${data.totals.totalPoints}`],
    ["Penalty per wrong run", `${rules.penaltyPerWrong} min`],
    [
      "Scoreboard freeze",
      rules.freezeMinutes > 0 ? `last ${rules.freezeMinutes} min` : "no freeze",
    ],
    [
      "Submission limit",
      rules.maxSubmissionsPerProblem > 0
        ? `${rules.maxSubmissionsPerProblem} per problem`
        : "unlimited",
    ],
    ["Languages", rules.languages.join(", ").toUpperCase() || "C"],
    ["Contestants", `${data.totals.participants}`],
    ["Total runs", `${data.totals.submissions}`],
    ["Accepted runs", `${data.totals.accepted}`],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="panel p-5">
        <h2 className="font-display text-lg font-semibold">Scoring</h2>
        <p className="measure mt-2 text-sm text-[var(--muted)]">
          ICPC rules. You are ranked by problems solved first, then by the lowest
          penalty. A solved problem adds the minute you solved it plus{" "}
          {rules.penaltyPerWrong} minutes for every rejected run before it. Rejected
          runs on problems you never solve cost nothing.
        </p>
        <dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {items.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] pb-2">
              <dt className="text-xs text-[var(--muted)]">{k}</dt>
              <dd className="font-mono text-xs text-[var(--text)]">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="space-y-4">
        {description && (
          <div className="panel p-5">
            <h2 className="font-display text-lg font-semibold">About</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">
              {description}
            </p>
          </div>
        )}
        {rules.notes && (
          <div className="panel border-[var(--warn-border)] p-5">
            <h2 className="font-display text-lg font-semibold text-[var(--warn)]">
              Notes from the organisers
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">
              {rules.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="panel px-5 py-14 text-center">
      <p className="text-sm text-[var(--muted)]">{text}</p>
    </div>
  );
}
