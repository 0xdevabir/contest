"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import type { ProblemSolver } from "@/lib/types";

type Props = {
  problemId: string;
  initialTotal: number;
  initialSolvers: ProblemSolver[];
  currentUserId?: string | null;
  refreshKey?: number;
};

function formatSolvedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export function ProblemSolvers({
  problemId,
  initialTotal,
  initialSolvers,
  currentUserId = null,
  refreshKey = 0,
}: Props) {
  const [total, setTotal] = useState(initialTotal);
  const [solvers, setSolvers] = useState(initialSolvers);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/problems/${problemId}/solvers`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        total?: number;
        solvers?: ProblemSolver[];
      };
      if (res.ok && data.ok) {
        setTotal(data.total ?? 0);
        setSolvers(data.solvers ?? []);
      }
    } catch {
      // Keep the last good list if the refresh fails.
    } finally {
      setLoading(false);
    }
  }, [problemId]);

  useEffect(() => {
    setTotal(initialTotal);
    setSolvers(initialSolvers);
  }, [problemId, initialTotal, initialSolvers]);

  useEffect(() => {
    if (refreshKey > 0) void load();
  }, [refreshKey, load]);

  return (
    <section className="panel mt-4 overflow-hidden sm:mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-[var(--accent)]" aria-hidden />
          <h2 className="font-display text-base font-bold sm:text-lg">Who solved this</h2>
        </div>
        <span className="tnum text-xs text-[var(--muted)]">
          {loading ? "Updating…" : `${total} solver${total === 1 ? "" : "s"}`}
        </span>
      </div>

      {solvers.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--muted)] sm:px-5">
          Nobody has solved this problem yet. Be the first.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--line-soft)]">
            {solvers.map((solver, index) => {
              const mine = currentUserId === solver.userId;
              return (
                <li
                  key={solver.userId}
                  className={`flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5 ${
                    mine ? "bg-[var(--accent-surface)]" : ""
                  }`}
                >
                  <span className="tnum w-6 shrink-0 text-xs text-[var(--muted-dim)]">
                    {index + 1}
                  </span>
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--bg-elevated)] text-[11px] font-semibold text-[var(--muted)]"
                  >
                    {initials(solver.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {solver.name}
                      {mine && (
                        <span className="ml-1.5 text-[11px] font-normal text-[var(--accent)]">
                          you
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted-dim)] sm:hidden">
                      {solver.university} · {formatSolvedAt(solver.firstSolvedAt)}
                    </p>
                  </div>
                  <span className="hidden w-20 shrink-0 text-xs text-[var(--muted)] sm:block">
                    {solver.university}
                  </span>
                  <time
                    dateTime={solver.firstSolvedAt}
                    className="tnum hidden shrink-0 text-right text-xs text-[var(--muted)] sm:block"
                  >
                    {formatSolvedAt(solver.firstSolvedAt)}
                  </time>
                </li>
              );
            })}
          </ul>
          {total > solvers.length && (
            <p className="border-t border-[var(--line-soft)] px-4 py-3 text-xs text-[var(--muted-dim)] sm:px-5">
              Showing the {solvers.length} most recent of {total}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
