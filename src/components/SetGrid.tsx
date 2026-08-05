"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { difficultyClass } from "@/lib/difficulty";
import { loadSolved } from "@/lib/progress";
import type { Difficulty } from "@/lib/types";

type SetCard = {
  set: number;
  title: string;
  problems: { id: string; difficulty: Difficulty }[];
};

export function SetGrid({ sets }: { sets: SetCard[] }) {
  const [solved, setSolved] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSolved(loadSolved());
  }, []);

  const total = sets.reduce((n, s) => n + s.problems.length, 0);
  const totalSolved = sets.reduce(
    (n, s) => n + s.problems.filter((p) => solved.has(p.id)).length,
    0
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-xl">
          <p className="eyebrow">The curriculum</p>
          <h2 className="font-display mt-3 text-[1.9rem] leading-[1.1] font-bold sm:text-[2.3rem]">
            {sets.length} sets. Same ramp every time.
          </h2>
          <p className="measure mt-4 text-[15px] leading-relaxed text-[var(--muted)]">
            Q1 starts at Very Easy and Q7 finishes at Extreme, so you always know how far
            into a set your ceiling is.
          </p>
        </div>

        <div className="w-full max-w-xs">
          <div className="flex items-baseline justify-between font-mono text-xs">
            <span className="text-[var(--muted)]">Solved on this device</span>
            <span className="tnum text-[var(--accent)]">
              {totalSolved}/{total}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--line)]">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${total ? (totalSolved / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map((s) => {
          const done = s.problems.filter((p) => solved.has(p.id)).length;
          const complete = done === s.problems.length && done > 0;
          return (
            <Link
              key={s.set}
              href={`/sets/${s.set}`}
              className="panel panel-hover group flex flex-col p-5"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-[0.15em] text-[var(--muted-dim)]">
                  SET {String(s.set).padStart(2, "0")}
                </span>
                <span
                  className={`tnum font-mono text-[11px] ${
                    complete ? "text-[var(--accent)]" : "text-[var(--muted-dim)]"
                  }`}
                >
                  {done}/{s.problems.length}
                </span>
              </div>

              <h3 className="font-display mt-3 flex-1 text-[1.05rem] font-bold leading-snug transition-colors group-hover:text-[var(--accent)]">
                {s.title}
              </h3>

              <div className="mt-5 flex items-center gap-1.5">
                {s.problems.map((p) => (
                  <span
                    key={p.id}
                    title={p.difficulty}
                    className={`${difficultyClass(p.difficulty)} h-1.5 flex-1 rounded-full bg-current transition-opacity ${
                      solved.has(p.id) ? "opacity-100" : "opacity-25"
                    }`}
                  />
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--line-soft)] pt-3 font-mono text-[10px] tracking-wider text-[var(--muted-dim)] uppercase">
                <span>Very easy → Extreme</span>
                <ArrowUpRight
                  size={13}
                  className="transition-colors group-hover:text-[var(--accent)]"
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

