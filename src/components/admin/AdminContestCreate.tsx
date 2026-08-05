"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ProblemOpt = { id: string; label: string };

export function AdminContestCreate({ problems }: { problems: ProblemOpt[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>(["set1-q1", "set1-q2", "set1-q3"]);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const startsAtRaw = String(fd.get("startsAt") || "");
    const payload = {
      title: String(fd.get("title") || ""),
      description: String(fd.get("description") || ""),
      durationMinutes: Number(fd.get("durationMinutes") || 120),
      startsAt: startsAtRaw ? new Date(startsAtRaw).toISOString() : null,
      rules: {
        freezeMinutes: Number(fd.get("freezeMinutes") || 60),
        penaltyPerWrong: Number(fd.get("penaltyPerWrong") || 20),
        notes: String(fd.get("notes") || ""),
      },
      problemIds: selected,
    };
    try {
      const res = await fetch("/api/admin/contests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Create failed");
        return;
      }
      router.refresh();
      (e.target as HTMLFormElement).reset();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel mt-4 space-y-4 p-5">
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Title</span>
        <input
          name="title"
          required
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Description</span>
        <textarea
          name="description"
          rows={3}
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Duration (min)</span>
          <input
            name="durationMinutes"
            type="number"
            defaultValue={120}
            min={10}
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Freeze (min)</span>
          <input
            name="freezeMinutes"
            type="number"
            defaultValue={60}
            min={0}
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Penalty / wrong</span>
          <input
            name="penaltyPerWrong"
            type="number"
            defaultValue={20}
            min={0}
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Start (optional)</span>
          <input
            name="startsAt"
            type="datetime-local"
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Rules notes</span>
        <input
          name="notes"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
          placeholder="e.g. ICPC style, no internet…"
        />
      </label>

      <div>
        <p className="text-sm text-[var(--muted)]">
          Problems ({selected.length} selected)
        </p>
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--line)] p-2">
          {problems.slice(0, 40).map((p) => (
            <label key={p.id} className="flex items-center gap-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span className="font-mono">{p.label}</span>
            </label>
          ))}
          <p className="pt-2 text-[11px] text-[var(--muted)]">
            Showing first 40 problems — enough for most contests.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy || selected.length === 0}>
        {busy ? "Creating…" : "Create contest"}
      </button>
    </form>
  );
}
