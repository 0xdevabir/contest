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
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow flex items-center gap-1.5">
          <Users size={12} aria-hidden />
          Who solved this
        </h2>
        <span className="tnum text-[11px] text-[var(--muted-dim)]">
          {loading ? "Updating…" : `${total} solver${total === 1 ? "" : "s"}`}
        </span>
      </div>

      {solvers.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          Nobody has solved this yet. Be the first.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--line-soft)] rounded-lg border border-[var(--line)]">
          {solvers.map((solver) => {
            const mine = currentUserId === solver.userId;
            return (
              <li
                key={solver.userId}
                className={`flex items-start justify-between gap-3 px-3 py-2.5 ${
                  mine ? "bg-[rgba(62,207,142,0.06)]" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {solver.name}
                    {mine && (
                      <span className="ml-1.5 text-[11px] font-normal text-[var(--accent)]">
                        you
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted-dim)]">
                    {solver.university}
                  </p>
                </div>
                <time
                  dateTime={solver.firstSolvedAt}
                  className="tnum shrink-0 text-right text-[11px] leading-snug text-[var(--muted)]"
                  title={formatSolvedAt(solver.firstSolvedAt)}
                >
                  {formatSolvedAt(solver.firstSolvedAt)}
                </time>
              </li>
            );
          })}
        </ul>
      )}

      {total > solvers.length && (
        <p className="mt-2 text-[11px] text-[var(--muted-dim)]">
          Showing the {solvers.length} most recent.
        </p>
      )}
    </div>
  );
}
