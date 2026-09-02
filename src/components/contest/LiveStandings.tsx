"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Snowflake, Trophy, Radio } from "lucide-react";
import type {
  ContestDashboardData,
  ContestProblemStat,
  ScoreboardRow,
} from "@/lib/contest-dashboard";
import { formatMinutes } from "./ContestClock";

type StandingsDiffRow = { rank: number; id: string; solved: number; penalty: number; points: number; cells: ScoreboardRow["cells"] };
type StandingsDiffPayload = { version: number; changed: StandingsDiffRow[]; removed: string[] };

/**
 * D2/D4 (docs/phases/PHASE-07-live-contest.md) — the standings table, plus
 * (when `liveEnabled`) a live SSE subscription that patches rows in place as
 * diffs arrive instead of waiting for the next full page refresh. Falls
 * back silently to whatever `data` the server last rendered if the stream
 * never connects — nothing here is authoritative, same as the submission
 * SSE stream.
 */
export function LiveStandings({
  contestId,
  data,
  viewerId,
  initialUni,
  liveEnabled,
}: {
  contestId: string;
  data: ContestDashboardData;
  viewerId: string | null;
  initialUni: string | null;
  liveEnabled: boolean;
}) {
  const [rows, setRows] = useState<ScoreboardRow[]>(data.rows);
  const [connected, setConnected] = useState(false);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const rowsById = useRef(new Map(data.rows.map((r) => [r.userId, r])));

  // A fresh SSR payload (tab switch, the 30s poll refresh) always wins over
  // whatever the stream had accumulated — it's a strictly newer read.
  useEffect(() => {
    setRows(data.rows);
    rowsById.current = new Map(data.rows.map((r) => [r.userId, r]));
  }, [data.rows]);

  useEffect(() => {
    if (!liveEnabled || data.phase !== "RUNNING") return;
    const es = new EventSource(`/api/contests/${contestId}/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("standings", (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as StandingsDiffPayload;
      const removed = new Set(payload.removed);
      const map = rowsById.current;
      for (const id of payload.removed) map.delete(id);
      for (const diffRow of payload.changed) {
        const prior = map.get(diffRow.id);
        map.set(diffRow.id, {
          rank: diffRow.rank,
          userId: diffRow.id,
          name: prior?.name ?? diffRow.id,
          institutionId: prior?.institutionId ?? null,
          institutionShortName: prior?.institutionShortName ?? null,
          solved: diffRow.solved,
          penalty: diffRow.penalty,
          points: diffRow.points,
          cells: diffRow.cells,
        });
      }
      const next = [...map.values()].filter((r) => !removed.has(r.userId)).sort((a, b) => a.rank - b.rank);
      setRows(next);
      const changedIds = new Set(payload.changed.map((r) => r.id));
      setFlashIds(changedIds);
      setTimeout(() => setFlashIds(new Set()), 2000);
    });
    return () => es.close();
  }, [liveEnabled, data.phase, contestId]);

  const [uni, setUni] = useState(initialUni ?? "");
  const [query, setQuery] = useState("");

  const institutions = useMemo(() => {
    const names = new Set(rows.map((r) => r.institutionShortName).filter(Boolean) as string[]);
    return [...names].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (!uni || r.institutionShortName === uni) && (!q || r.name.toLowerCase().includes(q)));
  }, [rows, uni, query]);

  const viewerVisible = filtered.some((r) => r.userId === viewerId);

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
        {institutions.map((name) => (
          <Chip key={name} active={uni === name} onClick={() => setUni(name)} label={name} />
        ))}
        {liveEnabled && data.phase === "RUNNING" && (
          <span
            className={`ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] ${
              connected ? "text-[var(--accent)]" : "text-[var(--muted)]"
            }`}
          >
            <Radio size={11} aria-hidden="true" className={connected ? "animate-pulse-soft" : ""} />
            {connected ? "Live" : "Connecting…"}
          </span>
        )}
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
                <th className="px-3 py-2.5 text-right font-semibold">
                  {data.scoring === "icpc" ? "Penalty" : "Score"}
                </th>
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4 + data.problems.length} className="px-4 py-12 text-center text-[var(--muted)]">
                    No contestants match this filter yet.
                  </td>
                </tr>
              )}
              {filtered.map((row) => (
                <StandingRow
                  key={row.userId}
                  row={row}
                  problems={data.problems}
                  scoring={data.scoring}
                  isViewer={row.userId === viewerId}
                  flash={flashIds.has(row.userId)}
                />
              ))}
            </tbody>
            {data.viewer && !viewerVisible && (
              <tfoot className="border-t-2 border-[var(--accent-border)]">
                <StandingRow row={data.viewer} problems={data.problems} scoring={data.scoring} isViewer flash={false} />
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
  scoring,
  isViewer,
  flash,
}: {
  row: ScoreboardRow;
  problems: ContestProblemStat[];
  scoring: ContestDashboardData["scoring"];
  isViewer: boolean;
  flash: boolean;
}) {
  return (
    <tr
      className={`transition-colors duration-1000 ${
        flash ? "bg-[var(--warn-surface)]" : isViewer ? "bg-[var(--accent-surface)]" : undefined
      }`}
    >
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
          {isViewer && <span className="ml-1.5 font-mono text-[10px] text-[var(--accent)]">you</span>}
        </span>
        <span className="block truncate text-[11px] text-[var(--muted)]">{row.institutionShortName ?? "—"}</span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono font-bold">{row.solved}</td>
      <td className="px-3 py-2.5 text-right font-mono text-[var(--muted)]">
        {scoring === "icpc" ? row.penalty : row.points}
      </td>
      {problems.map((p) => (
        <Cell key={p.problemId} cell={row.cells[p.problemId]} scoring={scoring} />
      ))}
    </tr>
  );
}

function Cell({ cell, scoring }: { cell: ScoreboardRow["cells"][string] | undefined; scoring: ContestDashboardData["scoring"] }) {
  if (!cell || (!cell.solved && cell.attempts === 0)) {
    return <td className="px-1 py-2.5 text-center font-mono text-xs text-[var(--muted)]">·</td>;
  }
  if (scoring !== "icpc") {
    const partial = cell.score != null && !cell.solved && cell.score > 0;
    if (!cell.solved && !partial) {
      return (
        <td className="px-1 py-1.5 text-center">
          <span className="inline-block min-w-[2.5rem] rounded bg-[var(--danger-surface)] px-1 py-0.5 font-mono text-[11px] font-bold text-[var(--danger)]">
            0
          </span>
        </td>
      );
    }
    return (
      <td className="px-1 py-1.5 text-center">
        <span
          className={`inline-flex min-w-[2.5rem] flex-col rounded px-1 py-0.5 font-mono text-[11px] font-bold leading-tight ${
            cell.solved
              ? cell.firstBlood
                ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                : "bg-[var(--accent-surface)] text-[var(--accent)]"
              : "bg-[var(--warn-surface)] text-[var(--warn)]"
          }`}
        >
          <span>{cell.score ?? 0}</span>
          <span className="font-normal opacity-80">{cell.solvedAtMin !== null ? formatMinutes(cell.solvedAtMin) : ""}</span>
        </span>
      </td>
    );
  }
  if (cell.solved) {
    return (
      <td className="px-1 py-1.5 text-center">
        <span
          className={`inline-flex min-w-[2.5rem] flex-col rounded px-1 py-0.5 font-mono text-[11px] font-bold leading-tight ${
            cell.firstBlood ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-[var(--accent-surface)] text-[var(--accent)]"
          }`}
        >
          <span>+{cell.attempts || ""}</span>
          <span className="font-normal opacity-80">{cell.solvedAtMin !== null ? formatMinutes(cell.solvedAtMin) : ""}</span>
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

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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
