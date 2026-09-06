"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  Circle,
  FilterX,
  Search,
  X,
} from "lucide-react";
import { difficultyClass, DIFFICULTY_ORDER } from "@/lib/difficulty";
import type { Difficulty } from "@/lib/types";
import { ListSkeleton } from "@/components/Skeleton";

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

type ApiResponse =
  | { ok: true; items: ArchiveItem[]; nextCursor: string | null }
  | { ok: false; message: string };

type SolveStatus = "" | "solved" | "unsolved";

const DIFF_SHORT: Record<Difficulty, string> = {
  "VERY EASY": "VE",
  EASY: "E",
  MEDIUM: "M",
  "MEDIUM-HARD": "MH",
  HARD: "H",
  "VERY HARD": "VH",
  EXTREME: "X",
};

function acceptanceRate(accepted: number, attempts: number): string | null {
  if (attempts <= 0) return null;
  return `${Math.round((accepted / attempts) * 100)}%`;
}

function isDifficulty(value: string | null): value is Difficulty {
  return !!value && (DIFFICULTY_ORDER as string[]).includes(value);
}

/**
 * DB-backed archive: searchable topic picker, compact difficulty/status
 * controls, shareable URL filters, and a denser results table driven by
 * GET /api/problems.
 */
export function ProblemArchiveClient({
  tags,
  loggedIn,
}: {
  tags: ArchiveTag[];
  loggedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tag, setTag] = useState<string | null>(() => searchParams.get("tag"));
  const [difficulty, setDifficulty] = useState<Difficulty | null>(() => {
    const d = searchParams.get("difficulty");
    return isDifficulty(d) ? d : null;
  });
  const [status, setStatus] = useState<SolveStatus>(() => {
    const s = searchParams.get("status");
    return s === "solved" || s === "unsolved" ? s : "";
  });
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const hasLoadedOnce = useRef(false);

  const topicTags = useMemo(
    () => tags.filter((t) => t.category !== "meta"),
    [tags]
  );
  const selectedTag = useMemo(
    () => topicTags.find((t) => t.slug === tag) ?? null,
    [topicTags, tag]
  );

  const activeCount = [difficulty, tag, status, q.trim()].filter(Boolean).length;

  const syncUrl = useCallback(
    (next: {
      tag: string | null;
      difficulty: Difficulty | null;
      status: SolveStatus;
      q: string;
    }) => {
      const params = new URLSearchParams();
      if (next.q.trim()) params.set("q", next.q.trim());
      if (next.difficulty) params.set("difficulty", next.difficulty);
      if (next.tag) params.set("tag", next.tag);
      if (next.status) params.set("status", next.status);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

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
        hasLoadedOnce.current = true;
      } catch {
        if (id === requestId.current) setError("Could not load problems. Try again.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [tag, difficulty, status, q]
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      syncUrl({ tag, difficulty, status, q });
      load({ reset: true });
    }, q ? 280 : 0);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag, difficulty, status, q]);

  function clearFilters() {
    setTag(null);
    setDifficulty(null);
    setStatus("");
    setQ("");
  }

  const showSkeleton = loading && !hasLoadedOnce.current && items.length === 0;

  return (
    <div className="mt-8">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/40 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search problems</span>
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by title or id…"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] py-2.5 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-[var(--muted-dim)] focus:border-[var(--accent)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            <DifficultyMenu value={difficulty} onChange={setDifficulty} />
            <TopicPicker
              tags={topicTags}
              value={tag}
              onChange={setTag}
              selected={selectedTag}
            />
            {loggedIn ? (
              <StatusSegment value={status} onChange={setStatus} />
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line-soft)] pt-3">
          {activeCount === 0 ? (
            <p className="text-xs text-[var(--muted)]">
              Browse the full bank, or narrow by difficulty, topic, and solve status.
            </p>
          ) : (
            <>
              {q.trim() ? (
                <FilterChip
                  label={`“${q.trim()}”`}
                  onRemove={() => setQ("")}
                />
              ) : null}
              {difficulty ? (
                <FilterChip
                  label={difficulty}
                  tone={difficultyClass(difficulty)}
                  onRemove={() => setDifficulty(null)}
                />
              ) : null}
              {selectedTag ? (
                <FilterChip
                  label={`#${selectedTag.name}`}
                  onRemove={() => setTag(null)}
                />
              ) : null}
              {status ? (
                <FilterChip
                  label={status === "solved" ? "Solved" : "Unsolved"}
                  onRemove={() => setStatus("")}
                />
              ) : null}
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--fg)]"
              >
                <FilterX size={12} aria-hidden />
                Clear
              </button>
            </>
          )}
          <span className="ml-auto font-mono text-[11px] tabular-nums text-[var(--muted-dim)]">
            {loading && items.length === 0
              ? "…"
              : `${items.length}${cursor ? "+" : ""} shown`}
          </span>
        </div>
      </div>

      {error ? <p className="mt-6 text-sm text-[var(--danger)]">{error}</p> : null}

      {showSkeleton ? (
        <ListSkeleton rows={10} />
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-[var(--line)]">
          <div className="hidden grid-cols-[2.25rem_5.5rem_minmax(0,1fr)_4.5rem_7rem] gap-3 border-b border-[var(--line-soft)] bg-[var(--bg-elevated)]/50 px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-dim)] sm:grid">
            <span className="sr-only">Status</span>
            <span>Id</span>
            <span>Problem</span>
            <span className="text-right">Acc</span>
            <span className="text-right">Difficulty</span>
          </div>

          <ul className="divide-y divide-[var(--line-soft)]">
            {items.map((p) => {
              const rate = acceptanceRate(p.accepted, p.attempts);
              return (
                <li key={p.id}>
                  <Link
                    href={`/problems/${p.id}`}
                    className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 transition-colors hover:bg-[var(--hover)] sm:grid-cols-[2.25rem_5.5rem_minmax(0,1fr)_4.5rem_7rem] sm:gap-3 sm:py-3"
                  >
                    <span className="flex items-center justify-center" aria-label={p.solved ? "Solved" : "Unsolved"}>
                      {p.solved ? (
                        <Check size={15} className="text-[var(--accent)]" strokeWidth={2.5} />
                      ) : (
                        <Circle size={13} className="text-[var(--muted-dim)]" strokeWidth={1.75} />
                      )}
                    </span>

                    <span className="hidden font-mono text-[11px] text-[var(--muted)] sm:block">
                      {p.id}
                    </span>

                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-mono text-[10px] text-[var(--muted-dim)] sm:hidden">
                          {p.id}
                        </span>
                        <span className="font-medium leading-snug tracking-tight">{p.title}</span>
                      </span>
                      {p.tags.length > 0 ? (
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          {p.tags.slice(0, 3).map((t) => (
                            <span
                              key={t.slug}
                              className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]"
                            >
                              {t.name}
                            </span>
                          ))}
                          {p.tags.length > 3 ? (
                            <span className="text-[10px] text-[var(--muted-dim)]">
                              +{p.tags.length - 3}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>

                    <span className="hidden text-right font-mono text-[11px] tabular-nums text-[var(--muted)] sm:block">
                      {rate ?? "—"}
                    </span>

                    <span
                      className={`justify-self-end rounded-md border border-[var(--line-soft)] px-2 py-1 text-right font-mono text-[10px] uppercase tracking-wide sm:justify-self-stretch sm:text-center ${difficultyClass(p.difficulty)}`}
                      title={p.difficulty}
                    >
                      <span className="sm:hidden">{DIFF_SHORT[p.difficulty]}</span>
                      <span className="hidden sm:inline">{p.difficulty}</span>
                    </span>
                  </Link>
                </li>
              );
            })}

            {items.length === 0 && !loading ? (
              <li className="px-5 py-14 text-center">
                <p className="text-sm text-[var(--muted)]">No problems match these filters.</p>
                {activeCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 text-sm text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    Clear filters
                  </button>
                ) : null}
              </li>
            ) : null}
          </ul>
        </div>
      )}

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
        ) : loading && hasLoadedOnce.current ? (
          <p className="text-xs text-[var(--muted)]">Loading…</p>
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
  tone,
}: {
  label: string;
  onRemove: () => void;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--bg)] py-1 pl-2.5 pr-1.5 text-xs transition-colors hover:border-[var(--muted)]"
    >
      <span className={`truncate ${tone ?? ""}`}>{label}</span>
      <X size={12} className="shrink-0 text-[var(--muted)]" aria-hidden />
      <span className="sr-only">Remove {label}</span>
    </button>
  );
}

function StatusSegment({
  value,
  onChange,
}: {
  value: SolveStatus;
  onChange: (next: SolveStatus) => void;
}) {
  const options: { id: SolveStatus; label: string }[] = [
    { id: "", label: "All" },
    { id: "solved", label: "Solved" },
    { id: "unsolved", label: "Todo" },
  ];
  return (
    <div
      role="group"
      aria-label="Solve status"
      className="inline-flex rounded-lg border border-[var(--line)] bg-[var(--bg)] p-0.5"
    >
      {options.map((opt) => (
        <button
          key={opt.id || "all"}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${
            value === opt.id
              ? "bg-[var(--accent-surface)] text-[var(--accent)]"
              : "text-[var(--muted)] hover:text-[var(--fg)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DifficultyMenu({
  value,
  onChange,
}: {
  value: Difficulty | null;
  onChange: (next: Difficulty | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-w-[9.5rem] items-center justify-between gap-2 rounded-lg border bg-[var(--bg)] px-3 py-2 text-left text-xs transition-colors ${
          value
            ? "border-[var(--accent-border)] text-[var(--fg)]"
            : "border-[var(--line)] text-[var(--muted)]"
        }`}
      >
        <span className={value ? difficultyClass(value) : undefined}>
          {value ?? "Difficulty"}
        </span>
        <ChevronDown size={13} className="shrink-0 opacity-70" aria-hidden />
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-72 w-52 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] py-1 shadow-lg"
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-[var(--hover)]"
            >
              All difficulties
              {!value ? <Check size={13} className="text-[var(--accent)]" /> : null}
            </button>
          </li>
          {DIFFICULTY_ORDER.map((tier) => (
            <li key={tier}>
              <button
                type="button"
                role="option"
                aria-selected={value === tier}
                onClick={() => {
                  onChange(tier === value ? null : tier);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--hover)]"
              >
                <span className={difficultyClass(tier)}>
                  <span className="mr-2 font-mono text-[10px] text-[var(--muted-dim)]">
                    {DIFF_SHORT[tier]}
                  </span>
                  {tier}
                </span>
                {value === tier ? (
                  <Check size={13} className="shrink-0 text-[var(--accent)]" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TopicPicker({
  tags,
  value,
  onChange,
  selected,
}: {
  tags: ArchiveTag[];
  value: string | null;
  onChange: (next: string | null) => void;
  selected: ArchiveTag | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? tags.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.slug.toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q)
        )
      : tags;
    const map = new Map<string, ArchiveTag[]>();
    for (const t of filtered) {
      const key = t.category || "other";
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [tags, query]);

  const flat = useMemo(() => grouped.flatMap(([, list]) => list), [grouped]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  function choose(slug: string | null) {
    onChange(slug);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[activeIndex];
      if (hit) choose(hit.slug === value ? null : hit.slug);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        onKeyDown={onKeyDown}
        className={`inline-flex min-w-[9.5rem] max-w-[14rem] items-center justify-between gap-2 rounded-lg border bg-[var(--bg)] px-3 py-2 text-left text-xs transition-colors ${
          selected
            ? "border-[var(--accent-border)] text-[var(--fg)]"
            : "border-[var(--line)] text-[var(--muted)]"
        }`}
      >
        <span className="truncate">{selected ? `#${selected.name}` : "Topic"}</span>
        <ChevronDown size={13} className="shrink-0 opacity-70" aria-hidden />
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1.5 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] shadow-lg sm:left-0 sm:right-auto">
          <div className="relative border-b border-[var(--line)]">
            <Search
              size={13}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              aria-hidden
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search topics…"
              className="w-full bg-transparent py-2.5 pl-8 pr-3 text-sm outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1" role="listbox">
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => choose(null)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-[var(--hover)]"
            >
              Any topic
              {!value ? <Check size={13} className="text-[var(--accent)]" /> : null}
            </button>
            {flat.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-[var(--muted)]">No topics match</p>
            ) : (
              grouped.map(([category, list]) => (
                <div key={category}>
                  <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-dim)]">
                    {category}
                  </p>
                  {list.map((t) => {
                    const flatIndex = flat.indexOf(t);
                    const active = flatIndex === activeIndex;
                    return (
                      <button
                        key={t.slug}
                        type="button"
                        role="option"
                        aria-selected={value === t.slug}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => choose(t.slug === value ? null : t.slug)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs ${
                          active ? "bg-[var(--hover)]" : ""
                        }`}
                      >
                        <span className="truncate">#{t.name}</span>
                        {value === t.slug ? (
                          <Check size={13} className="shrink-0 text-[var(--accent)]" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
