"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { difficultyClass } from "@/lib/difficulty";
import type { Difficulty } from "@/lib/types";
import { DIFFICULTY_ORDER } from "@/lib/difficulty";

export type ArchiveTag = { slug: string; name: string; category: string };

export type ArchiveItem = {
  id: string;
  title: string;
  difficulty: Difficulty;
  set: number | null;
  question: number | null;
  tags: { slug: string; name: string }[];
  attempts: number;
  accepted: number;
  solved: boolean | null;
};

type ApiResponse = { ok: true; items: ArchiveItem[]; nextCursor: string | null } | { ok: false; message: string };

/**
 * DB-backed archive (Phase 2, acceptance criterion 7): tag chips,
 * difficulty filter, solved/unsolved for signed-in users, search, and
 * cursor pagination — all driven by GET /api/problems.
 */
export function ProblemArchiveClient({ tags, loggedIn }: { tags: ArchiveTag[]; loggedIn: boolean }) {
  const [tag, setTag] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [status, setStatus] = useState<"" | "solved" | "unsolved">("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const topicTags = useMemo(() => tags.filter((t) => t.category !== "meta").slice(0, 24), [tags]);

  const load = useCallback(
    async (opts: { reset: boolean; cursor?: string | null }) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (tag) params.set("tag", tag);
      if (difficulty) params.set("difficulty", difficulty);
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      if (opts.cursor) params.set("cursor", opts.cursor);

      try {
        const res = await fetch(`/api/problems?${params.toString()}`);
        const data = (await res.json()) as ApiResponse;
        if (id !== requestId.current) return;
        if (!data.ok) {
          setError(data.message);
          return;
        }
        setItems((prev) => (opts.reset ? data.items : [...prev, ...data.items]));
        setCursor(data.nextCursor);
      } catch {
        if (id === requestId.current) setError("Could not load problems. Try again.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [tag, difficulty, status, q]
  );

  useEffect(() => {
    const handle = window.setTimeout(() => load({ reset: true }), q ? 280 : 0);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag, difficulty, status, q]);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setDifficulty(null)}
          className={`shrink-0 font-mono text-[11px] uppercase tracking-wide px-3 py-1.5 rounded border transition-colors ${
            !difficulty
              ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
              : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)]"
          }`}
        >
          All difficulties
        </button>
        {DIFFICULTY_ORDER.map((tier) => (
          <button
            key={tier}
            type="button"
            onClick={() => setDifficulty(tier === difficulty ? null : tier)}
            className={`shrink-0 font-mono text-[11px] uppercase tracking-wide px-3 py-1.5 rounded border transition-colors ${
              difficulty === tier
                ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
                : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)]"
            }`}
          >
            <span className={difficultyClass(tier)}>{tier}</span>
          </button>
        ))}
      </div>

      {topicTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {topicTags.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => setTag(t.slug === tag ? null : t.slug)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                tag === t.slug
                  ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)]"
              }`}
            >
              #{t.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title…"
            className="w-full rounded border border-[var(--line)] bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        {loggedIn ? (
          <div className="flex gap-2 font-mono text-[11px] uppercase tracking-wide">
            {(["", "solved", "unsolved"] as const).map((s) => (
              <button
                key={s || "all"}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded border px-3 py-1.5 transition-colors ${
                  status === s
                    ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)]"
                }`}
              >
                {s || "All"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-6 text-sm text-[var(--danger)]">{error}</p> : null}

      <ul className="mt-6 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
        {items.map((p) => (
          <li key={p.id}>
            <Link
              href={`/problems/${p.id}`}
              className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-[var(--hover)]"
            >
              <div className="min-w-0">
                <span className="font-mono text-[10px] text-[var(--muted-dim)]">{p.id}</span>
                {p.solved ? (
                  <span className="ml-2 font-mono text-[10px] text-[var(--accent)]">SOLVED</span>
                ) : null}
                <span className="ml-3 font-medium">{p.title}</span>
                {p.tags.length > 0 ? (
                  <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                    {p.tags.map((t) => t.name).join(" · ")}
                  </p>
                ) : null}
              </div>
              <span className={`shrink-0 font-mono text-[11px] uppercase tracking-wide ${difficultyClass(p.difficulty)}`}>
                {p.difficulty}
              </span>
            </Link>
          </li>
        ))}
        {items.length === 0 && !loading ? (
          <li className="px-5 py-10 text-center text-sm text-[var(--muted)]">No problems match these filters.</li>
        ) : null}
      </ul>

      <div className="mt-6 flex justify-center">
        {cursor ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => load({ reset: false, cursor })}
            className="btn btn-ghost !text-xs disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : loading ? (
          <p className="text-xs text-[var(--muted)]">Loading…</p>
        ) : null}
      </div>
    </div>
  );
}
