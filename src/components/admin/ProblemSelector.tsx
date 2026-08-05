"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";

export type AdminProblemOption = {
  id: string;
  title: string;
  set: number;
  question: number;
  difficulty: string;
};

export function ProblemSelector({
  problems,
  selected,
  onChange,
}: {
  problems: AdminProblemOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [setFilter, setSetFilter] = useState("all");
  const byId = useMemo(() => new Map(problems.map((problem) => [problem.id, problem])), [problems]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return problems.filter((problem) => {
      if (setFilter !== "all" && problem.set !== Number(setFilter)) return false;
      if (!query) return true;
      return (
        problem.title.toLowerCase().includes(query) ||
        problem.id.toLowerCase().includes(query) ||
        `set ${problem.set} q${problem.question}`.includes(query)
      );
    });
  }, [problems, search, setFilter]);

  function add(id: string) {
    if (!selected.includes(id)) onChange([...selected, id]);
  }

  function remove(id: string) {
    onChange(selected.filter((item) => item !== id));
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...selected];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border border-[var(--line)] bg-black/15">
        <div className="border-b border-[var(--line)] p-3">
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                aria-hidden="true"
              />
              <span className="sr-only">Search problems</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search 700 problems…"
                className="w-full rounded-lg border border-[var(--line)] bg-[#0a0f16] py-2 pl-9 pr-3 text-xs outline-none focus:border-[var(--accent-dim)]"
              />
            </label>
            <label>
              <span className="sr-only">Filter by set</span>
              <select
                value={setFilter}
                onChange={(event) => setSetFilter(event.target.value)}
                className="rounded-lg border border-[var(--line)] bg-[#0a0f16] px-2 py-2 text-xs outline-none"
              >
                <option value="all">All sets</option>
                {Array.from({ length: 20 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    Set {index + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="max-h-80 divide-y divide-[var(--line)] overflow-y-auto">
          {filtered.map((problem) => {
            const added = selected.includes(problem.id);
            return (
              <div key={problem.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white/[0.04] font-mono text-[10px] text-[var(--muted)]">
                  {problem.set}.{problem.question}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{problem.title}</p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase text-[var(--muted)]">
                    {problem.difficulty}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => (added ? remove(problem.id) : add(problem.id))}
                  className={`grid size-7 shrink-0 place-items-center rounded-md border transition-colors ${
                    added
                      ? "border-[var(--accent-dim)] text-[var(--accent)]"
                      : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                  aria-label={added ? `Remove ${problem.title}` : `Add ${problem.title}`}
                >
                  {added ? <X size={13} /> : <Plus size={13} />}
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-4 py-10 text-center text-xs text-[var(--muted)]">
              No matching problems.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-black/15">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-3">
          <div>
            <h3 className="text-xs font-semibold">Contest order</h3>
            <p className="mt-0.5 text-[10px] text-[var(--muted)]">
              Labels are assigned A, B, C…
            </p>
          </div>
          <span className="rounded-md bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-[var(--muted)]">
            {selected.length}/50
          </span>
        </div>
        <div className="max-h-80 divide-y divide-[var(--line)] overflow-y-auto">
          {selected.map((id, index) => {
            const problem = byId.get(id);
            if (!problem) return null;
            return (
              <div key={id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[rgba(62,207,142,0.1)] font-mono text-xs font-semibold text-[var(--accent)]">
                  {String.fromCharCode(65 + index)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{problem.title}</p>
                  <p className="font-mono text-[9px] text-[var(--muted)]">{problem.id}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="grid size-6 place-items-center text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-20"
                    aria-label={`Move ${problem.title} up`}
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === selected.length - 1}
                    className="grid size-6 place-items-center text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-20"
                    aria-label={`Move ${problem.title} down`}
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    className="grid size-6 place-items-center text-[var(--muted)] hover:text-[var(--danger)]"
                    aria-label={`Remove ${problem.title}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            );
          })}
          {selected.length === 0 && (
            <p className="px-4 py-10 text-center text-xs text-[var(--muted)]">
              Add at least one problem from the bank.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

