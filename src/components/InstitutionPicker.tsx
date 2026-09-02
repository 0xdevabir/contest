"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type InstitutionOption = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  district: string | null;
  verified: boolean;
};

/**
 * Searchable, keyboard-navigable combobox over the institution list — a
 * plain <select> is unusable at 60+ options. Renders a hidden input so it
 * still participates in a plain <form> submit like any other field.
 */
export function InstitutionPicker({
  name,
  institutions,
  defaultValue,
  required,
}: {
  name: string;
  institutions: InstitutionOption[];
  defaultValue?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(defaultValue ?? "");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = institutions.find((i) => i.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? institutions
      : institutions.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.shortName.toLowerCase().includes(q) ||
            i.slug.toLowerCase().includes(q)
        );
    return list.slice(0, 60);
  }, [institutions, query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  function choose(inst: InstitutionOption) {
    setSelectedId(inst.id);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const inst = filtered[activeIndex];
      if (inst) choose(inst);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={selectedId} required={required} />
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={selected ? "" : "text-[var(--muted-dim)]"}>
          {selected ? selected.name : "Choose your institution…"}
        </span>
        <ChevronDown size={14} className="shrink-0 text-[var(--muted)]" aria-hidden />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] shadow-lg">
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
              placeholder="Search institutions…"
              className="w-full bg-transparent py-2.5 pl-8 pr-3 text-sm outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-[var(--muted)]">No matches</li>
            )}
            {filtered.map((inst, index) => (
              <li key={inst.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={inst.id === selectedId}
                  onClick={() => choose(inst)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    index === activeIndex ? "bg-[var(--hover)]" : ""
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {inst.name}
                    {inst.district ? (
                      <span className="ml-1.5 text-xs text-[var(--muted)]">· {inst.district}</span>
                    ) : null}
                  </span>
                  {inst.id === selectedId && (
                    <Check size={14} className="shrink-0 text-[var(--accent)]" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
