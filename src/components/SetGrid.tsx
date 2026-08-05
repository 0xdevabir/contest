"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SOLVED_KEY = "contest-hub:solved";

type SetCard = {
  set: number;
  title: string;
  problemIds: string[];
};

export function SetGrid({ sets }: { sets: SetCard[] }) {
  const [solved, setSolved] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SOLVED_KEY);
      setSolved(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setSolved(new Set());
    }
  }, []);

  const totalSolved = sets.reduce(
    (n, s) => n + s.problemIds.filter((id) => solved.has(id)).length,
    0
  );
  const total = sets.reduce((n, s) => n + s.problemIds.length, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-700">Problem sets</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Each set ramps Very Easy → Extreme (Q1–Q7).
          </p>
        </div>
        <p className="font-mono text-xs text-[var(--accent)]">
          {totalSolved}/{total} solved locally
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map((s) => {
          const done = s.problemIds.filter((id) => solved.has(id)).length;
          return (
            <Link
              key={s.set}
              href={`/sets/${s.set}`}
              className="panel group block p-4 transition-colors hover:border-[var(--accent-dim)]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-[var(--accent)]">
                  SET {String(s.set).padStart(2, "0")}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {done}/7
                </span>
              </div>
              <h3 className="mt-2 font-display text-lg font-600 leading-snug group-hover:text-[var(--accent)]">
                {s.title}
              </h3>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--line)]">
                <div
                  className="h-full bg-[var(--accent)] transition-all"
                  style={{ width: `${(done / 7) * 100}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
