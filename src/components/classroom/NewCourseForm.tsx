"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Department = { id: string; name: string; shortName: string };

export function NewCourseForm({ departments }: { departments: Department[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      code: form.get("code"),
      title: form.get("title"),
      description: form.get("description") || undefined,
      credits: form.get("credits") ? Number(form.get("credits")) : undefined,
    };
    if (departmentId) {
      body.departmentId = departmentId;
    } else {
      body.departmentName = form.get("departmentName");
      body.departmentShortName = form.get("departmentShortName");
    }

    const res = await fetch("/api/teacher/courses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? "Could not create course");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary !text-xs">
        New course
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 sm:grid-cols-2"
    >
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Department</span>
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs"
        >
          <option value="">New department…</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.shortName} — {d.name}
            </option>
          ))}
        </select>
      </label>
      {!departmentId && (
        <>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--muted)]">Department name</span>
            <input name="departmentName" required className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--muted)]">Short name</span>
            <input name="departmentShortName" required maxLength={20} className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs" />
          </label>
        </>
      )}
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Course code</span>
        <input name="code" required placeholder="CSE 213" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs" />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Title</span>
        <input name="title" required placeholder="Data Structures" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs" />
      </label>
      <label className="text-xs sm:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Description (optional)</span>
        <textarea name="description" rows={2} className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs" />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Credits</span>
        <input name="credits" type="number" step="0.5" min="0" max="12" defaultValue={3} className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs" />
      </label>

      {error && <p className="text-xs text-[var(--danger)] sm:col-span-2">{error}</p>}

      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary !text-xs">
          {pending ? "Creating…" : "Create course"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost !text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}
