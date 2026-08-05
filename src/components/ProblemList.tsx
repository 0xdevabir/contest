"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { difficultyClass } from "@/lib/difficulty";
import type { Difficulty } from "@/lib/types";
import { loadSolved } from "@/lib/progress";

type Item = {
  id: string;
  question: number;
  title: string;
  difficulty: Difficulty;
};

type Props = {
  problems: Item[];
  setHref?: boolean;
};

export function ProblemList({ problems }: Props) {
  const [solved, setSolved] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSolved(loadSolved());
  }, []);

  const done = problems.filter((p) => solved.has(p.id)).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>
          Progress · {done}/{problems.length} solved
        </span>
        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className="h-full bg-[var(--accent)] transition-all"
            style={{ width: `${(done / Math.max(problems.length, 1)) * 100}%` }}
          />
        </div>
      </div>
      <ul className="panel divide-y divide-[var(--line)] overflow-hidden">
        {problems.map((p) => {
          const isSolved = solved.has(p.id);
          return (
            <li key={p.id}>
              <Link
                href={`/problems/${p.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--hover)]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
                    <span>Q{p.question}</span>
                    {isSolved && (
                      <span className="rounded bg-[var(--accent-surface-strong)] px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                        SOLVED
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-lg font-medium">{p.title}</div>
                </div>
                <span
                  className={`shrink-0 font-mono text-[11px] uppercase tracking-wide ${difficultyClass(p.difficulty)}`}
                >
                  {p.difficulty}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

