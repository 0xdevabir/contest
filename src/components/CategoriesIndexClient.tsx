"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { difficultyClass } from "@/lib/difficulty";
import type { CategorySummary, Difficulty } from "@/lib/types";
import { loadSolved } from "@/lib/progress";

export function CategoriesIndexClient({
  categories,
  initialQuery = "",
}: {
  categories: CategorySummary[];
  initialQuery?: string;
}) {
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Difficulty | "ALL">("ALL");
  const [q, setQ] = useState(initialQuery);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    setSolved(loadSolved());
  }, []);

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const current = (searchParams.get("q") ?? "").trim();
      const next = q.trim();
      if (current === next) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("q", next);
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 280);
    return () => window.clearTimeout(handle);
    // Intentionally omit searchParams — we only push when `q` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pathname, router]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return categories
      .filter((c) => active === "ALL" || c.tier === active)
      .map((c) => ({
        ...c,
        problems: c.problems.filter((p) => {
          if (!needle) return true;
          return (
            p.title.toLowerCase().includes(needle) ||
            p.id.toLowerCase().includes(needle) ||
            (p.topic ?? "").toLowerCase().includes(needle)
          );
        }),
      }))
      .filter((c) => c.problems.length > 0);
  }, [categories, active, q]);

  const total = categories.reduce((n, c) => n + c.count, 0);
  const totalSolved = categories.reduce(
    (n, c) => n + c.problems.filter((p) => solved.has(p.id)).length,
    0
  );

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setActive("ALL")}
            className={`shrink-0 font-mono text-[11px] uppercase tracking-wide px-3 py-1.5 rounded border transition-colors ${
              active === "ALL"
                ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
                : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)]"
            }`}
          >
            All · {total}
          </button>
          {categories.map((c) => (
            <button
              key={c.tier}
              type="button"
              onClick={() => setActive(c.tier)}
              className={`shrink-0 font-mono text-[11px] uppercase tracking-wide px-3 py-1.5 rounded border transition-colors ${
                active === c.tier
                  ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)]"
              }`}
            >
              <span className={difficultyClass(c.tier)}>{c.tier}</span>
              <span className="ml-1.5 text-[var(--muted-dim)]">{c.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-[var(--muted)]">
            <span className="text-[var(--accent)]">{totalSolved}</span>/{total} solved
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, topic, id…"
            className="w-full sm:w-64 rounded border border-[var(--line)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <div className="mt-8 space-y-6">
        {filtered.map((c) => {
          const done = c.problems.filter((p) => solved.has(p.id)).length;
          return (
            <section key={c.tier} className="panel overflow-hidden" id={`tier-${c.tier}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
                <div>
                  <p className={`font-mono text-xs uppercase tracking-wide ${difficultyClass(c.tier)}`}>
                    {c.tier}
                  </p>
                  <h2 className="font-display text-xl font-semibold">
                    {c.problems.length} problems
                    {q ? (
                      <span className="ml-2 font-mono text-xs font-normal text-[var(--muted)]">
                        filtered from {c.count}
                      </span>
                    ) : null}
                  </h2>
                </div>
                <p className="font-mono text-xs text-[var(--muted)]">
                  {done}/{c.problems.length} on this device
                </p>
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {c.problems.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/problems/${p.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-white/[0.03]"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-[10px] text-[var(--muted-dim)]">
                          {p.id}
                        </span>
                        {solved.has(p.id) && (
                          <span className="ml-2 font-mono text-[10px] text-[var(--accent)]">
                            SOLVED
                          </span>
                        )}
                        {p.source === "authored" && (
                          <span className="ml-2 font-mono text-[10px] text-[var(--muted)]">
                            CORE
                          </span>
                        )}
                        <span className="ml-3 font-medium">{p.title}</span>
                        {p.topic ? (
                          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{p.topic}</p>
                        ) : null}
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
        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No problems match that filter.</p>
        ) : null}
      </div>
    </div>
  );
}


