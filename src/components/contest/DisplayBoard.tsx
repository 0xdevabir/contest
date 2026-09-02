"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Snowflake, Trophy } from "lucide-react";
import type { ContestDashboardData, ScoreboardRow } from "@/lib/contest-dashboard";

type StandingsDiffRow = { rank: number; id: string; solved: number; penalty: number; points: number; cells: ScoreboardRow["cells"] };
type StandingsDiffPayload = { version: number; changed: StandingsDiffRow[]; removed: string[] };

export function DisplayBoard(props: { contestId: string; title: string; data: ContestDashboardData; liveEnabled: boolean; canResolve: boolean }) {
  return (
    <Suspense fallback={null}>
      <DisplayBoardInner {...props} />
    </Suspense>
  );
}

function DisplayBoardInner({
  contestId,
  title,
  data,
  liveEnabled,
  canResolve,
}: {
  contestId: string;
  title: string;
  data: ContestDashboardData;
  liveEnabled: boolean;
  canResolve: boolean;
}) {
  const params = useSearchParams();
  const rowsPerPage = Math.max(5, Number(params.get("rows")) || 20);
  const intervalSec = Math.max(5, Number(params.get("interval")) || 15);
  const resolverMode = params.get("resolver") === "1" && canResolve;

  const [rows, setRows] = useState<ScoreboardRow[]>(data.rows);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  useEffect(() => setRows(data.rows), [data.rows]);

  // Auto-advance through the board — disabled in resolver mode, which is
  // presenter-paced instead.
  useEffect(() => {
    if (resolverMode || pageCount <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pageCount), intervalSec * 1000);
    return () => clearInterval(id);
  }, [resolverMode, pageCount, intervalSec]);

  useEffect(() => {
    if (!liveEnabled || resolverMode || data.phase !== "RUNNING") return;
    const es = new EventSource(`/api/contests/${contestId}/stream`);
    es.addEventListener("standings", (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as StandingsDiffPayload;
      setRows((prev) => {
        const map = new Map(prev.map((r) => [r.userId, r]));
        for (const id of payload.removed) map.delete(id);
        for (const d of payload.changed) {
          const prior = map.get(d.id);
          map.set(d.id, {
            rank: d.rank,
            userId: d.id,
            name: prior?.name ?? d.id,
            institutionId: prior?.institutionId ?? null,
            institutionShortName: prior?.institutionShortName ?? null,
            solved: d.solved,
            penalty: d.penalty,
            points: d.points,
            cells: d.cells,
          });
        }
        return [...map.values()].sort((a, b) => a.rank - b.rank);
      });
    });
    return () => es.close();
  }, [liveEnabled, resolverMode, data.phase, contestId]);

  const visible = rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <div className="min-h-screen bg-black px-6 py-6 text-white">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
        <div className="flex items-center gap-4 font-mono text-lg">
          {data.frozen && (
            <span className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-cyan-300">
              <Snowflake size={20} aria-hidden="true" />
              FROZEN
            </span>
          )}
          {!resolverMode && pageCount > 1 && (
            <span className="text-white/50">
              page {page + 1}/{pageCount}
            </span>
          )}
        </div>
      </header>

      {resolverMode ? (
        <Resolver contestId={contestId} problems={data.problems} scoring={data.scoring} />
      ) : (
        <BoardTable rows={visible} problems={data.problems} scoring={data.scoring} />
      )}
    </div>
  );
}

function BoardTable({
  rows,
  problems,
  scoring,
  highlightIds,
}: {
  rows: ScoreboardRow[];
  problems: ContestDashboardData["problems"];
  scoring: ContestDashboardData["scoring"];
  highlightIds?: Set<string>;
}) {
  return (
    <table className="w-full border-collapse text-left">
      <thead className="border-b-2 border-white/20 text-sm uppercase tracking-widest text-white/50">
        <tr>
          <th className="py-3 pr-4 text-center">#</th>
          <th className="py-3 pr-4">Team</th>
          <th className="py-3 pr-4 text-right">Solved</th>
          <th className="py-3 pr-4 text-right">{scoring === "icpc" ? "Penalty" : "Score"}</th>
          {problems.map((p) => (
            <th key={p.problemId} className="w-16 py-3 text-center font-mono">
              {p.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/10">
        {rows.map((row) => (
          <tr
            key={row.userId}
            className={`text-2xl transition-colors duration-1000 ${highlightIds?.has(row.userId) ? "bg-yellow-500/20" : ""}`}
          >
            <td className="py-3 pr-4 text-center font-mono">
              {row.rank <= 3 && row.solved > 0 ? (
                <span className="inline-flex items-center gap-2 text-yellow-400">
                  <Trophy size={22} aria-hidden="true" />
                  {row.rank}
                </span>
              ) : (
                row.rank
              )}
            </td>
            <td className="max-w-[20rem] truncate py-3 pr-4 font-semibold">{row.name}</td>
            <td className="py-3 pr-4 text-right font-mono font-bold">{row.solved}</td>
            <td className="py-3 pr-4 text-right font-mono text-white/70">{scoring === "icpc" ? row.penalty : row.points}</td>
            {problems.map((p) => {
              const cell = row.cells[p.problemId];
              return (
                <td key={p.problemId} className="text-center font-mono text-sm">
                  {!cell || (!cell.solved && cell.attempts === 0) ? (
                    <span className="text-white/30">·</span>
                  ) : cell.solved ? (
                    <span className={`inline-block rounded px-1.5 py-1 ${cell.firstBlood ? "bg-yellow-500 text-black" : "bg-emerald-600"}`}>
                      +{cell.attempts || ""}
                    </span>
                  ) : (
                    <span className="inline-block rounded bg-red-700 px-1.5 py-1">−{cell.attempts}</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * D4's resolver — ICPC-style bottom-up unfreeze: starts from the frozen
 * board, then reveals one row at a time from worst rank to best, swapping
 * that row's frozen cells for its true final ones. Space/click advances.
 */
function Resolver({
  contestId,
  problems,
  scoring,
}: {
  contestId: string;
  problems: ContestDashboardData["problems"];
  scoring: ContestDashboardData["scoring"];
}) {
  const [freeze, setFreeze] = useState<ContestDashboardData | null>(null);
  const [final, setFinal] = useState<ContestDashboardData | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    fetch(`/api/contests/${contestId}/standings/resolver`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setFreeze(d.freeze);
          setFinal(d.final);
        }
      })
      .catch(() => undefined);
  }, [contestId]);

  // Worst final rank first — the ICPC reveal order.
  const order = useMemo(() => {
    if (!final) return [];
    return [...final.rows].sort((a, b) => b.rank - a.rank).map((r) => r.userId);
  }, [final]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" || e.key === "ArrowRight") {
        e.preventDefault();
        setRevealedCount((c) => Math.min(order.length, c + 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order.length]);

  if (!freeze || !final) {
    return <p className="py-20 text-center text-2xl text-white/60">No freeze/final snapshot yet — the resolver needs the contest to have ended.</p>;
  }

  const revealed = new Set(order.slice(0, revealedCount));
  const finalById = new Map(final.rows.map((r) => [r.userId, r]));
  const merged = final.rows.map((r) => (revealed.has(r.userId) ? r : (freeze.rows.find((f) => f.userId === r.userId) ?? r)));
  merged.sort((a, b) => (revealed.has(a.userId) || revealed.has(b.userId) ? a.rank - b.rank : (finalById.get(a.userId)?.rank ?? a.rank) - (finalById.get(b.userId)?.rank ?? b.rank)));

  return (
    <div>
      <BoardTable rows={merged} problems={problems} scoring={scoring} highlightIds={revealed.size > 0 ? new Set([order[revealedCount - 1]]) : undefined} />
      <p className="mt-6 text-center font-mono text-lg text-white/50">
        {revealedCount}/{order.length} revealed — press space or click to continue
      </p>
      <button
        type="button"
        onClick={() => setRevealedCount((c) => Math.min(order.length, c + 1))}
        className="fixed inset-0 cursor-pointer"
        aria-label="Reveal next"
      />
    </div>
  );
}
