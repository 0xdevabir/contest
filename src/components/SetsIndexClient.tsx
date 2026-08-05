"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { difficultyClass } from "@/lib/difficulty";
import type { Difficulty } from "@/lib/types";
import { loadSolved } from "@/lib/progress";

type ProblemItem = {
  id: string;
  question: number;
  title: string;
  difficulty: Difficulty;
};

type SetItem = {
  set: number;
  title: string;
  problems: ProblemItem[];
};

export function SetsIndexClient({ sets }: { sets: SetItem[] }) {
  const [solved, setSolved] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSolved(loadSolved());
  }, []);

  return (
    <div className="mt-8 space-y-6">
      {sets.map((s) => {
        const done = s.problems.filter((p) => solved.has(p.id)).length;
        return (
          <section key={s.set} className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
              <div>
                <p className="font-mono text-xs text-[var(--accent)]">
                  SET {String(s.set).padStart(2, "0")} · {done}/7
                </p>
                <h2 className="font-display text-xl font-semibold">{s.title}</h2>
              </div>
              <Link href={`/sets/${s.set}`} className="btn btn-ghost !py-2 !text-xs">
                Open set
              </Link>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {s.problems.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/problems/${p.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-white/[0.03]"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-[var(--muted)]">
                        Q{p.question}
                      </span>
                      {solved.has(p.id) && (
                        <span className="ml-2 font-mono text-[10px] text-[var(--accent)]">
                          SOLVED
                        </span>
                      )}
                      <span className="ml-3 font-medium">{p.title}</span>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-[11px] uppercase tracking-wide ${difficultyClass(p.difficulty)}`}
                    >
                      {p.difficulty}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

