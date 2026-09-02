"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewAssignmentForm({ sectionId }: { sectionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problemsText, setProblemsText] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const problems = problemsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [slug, points] = line.split(",").map((s) => s.trim());
        return { problemSlug: slug, points: points ? Number(points) : 100 };
      });

    if (problems.length === 0) {
      setPending(false);
      setError("Add at least one problem (slug per line, optionally \"slug, points\")");
      return;
    }

    const toIso = (name: string) => {
      const v = form.get(name);
      return v ? new Date(String(v)).toISOString() : null;
    };

    const res = await fetch(`/api/teacher/sections/${sectionId}/assignments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        opensAt: toIso("opensAt"),
        dueAt: toIso("dueAt"),
        closesAt: toIso("closesAt"),
        latePolicy: form.get("latePolicy"),
        lateParam: Number(form.get("lateParam") || 0),
        weight: Number(form.get("weight") || 1),
        problems,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? "Could not create assignment");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary !text-xs">
        New assignment
      </button>
    );
  }

  const inputCls = "w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs";

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 sm:grid-cols-2">
      <label className="text-xs sm:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Title</span>
        <input name="title" required placeholder="Homework 1" className={inputCls} />
      </label>

      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Opens at</span>
        <input name="opensAt" type="datetime-local" className={inputCls} />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Due at</span>
        <input name="dueAt" type="datetime-local" className={inputCls} />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Closes at (hard cutoff)</span>
        <input name="closesAt" type="datetime-local" className={inputCls} />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Weight</span>
        <input name="weight" type="number" step="0.1" min="0" defaultValue={1} className={inputCls} />
      </label>

      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Late policy</span>
        <select name="latePolicy" defaultValue="NONE" className={inputCls}>
          <option value="NONE">None (0% after due)</option>
          <option value="LINEAR">Linear (% lost per day)</option>
          <option value="GRACE_THEN_LINEAR">Grace hours, then 10%/day</option>
          <option value="REJECT">Reject late submissions</option>
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Late param (%/day or grace hours)</span>
        <input name="lateParam" type="number" step="1" min="0" defaultValue={0} className={inputCls} />
      </label>

      <label className="text-xs sm:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">
          Problems — one per line: <code>slug</code> or <code>slug, points</code>
        </span>
        <textarea
          value={problemsText}
          onChange={(e) => setProblemsText(e.target.value)}
          rows={4}
          placeholder={"set1-q1, 100\nset1-q2, 50"}
          className={`${inputCls} font-mono`}
        />
      </label>

      {error && <p className="text-xs text-[var(--danger)] sm:col-span-2">{error}</p>}

      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary !text-xs">
          {pending ? "Creating…" : "Create assignment"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost !text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}
