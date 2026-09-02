"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Student = { userId: string; name: string };

export function ExtensionForm({ assignmentId, students }: { assignmentId: string; students: Student[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const newDueAt = form.get("newDueAt");
    const res = await fetch(`/api/teacher/assignments/${assignmentId}/extensions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: form.get("userId"),
        newDueAt: newDueAt ? new Date(String(newDueAt)).toISOString() : undefined,
        reason: form.get("reason") || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? "Could not grant the extension");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  const inputCls = "w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs";

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4">
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Student</span>
        <select name="userId" required className={inputCls}>
          {students.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">New due date</span>
        <input name="newDueAt" type="datetime-local" required className={inputCls} />
      </label>
      <label className="text-xs sm:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Reason (optional)</span>
        <input name="reason" className={inputCls} />
      </label>
      {error && <p className="text-xs text-[var(--danger)] sm:col-span-4">{error}</p>}
      <div className="sm:col-span-4">
        <button type="submit" disabled={pending || students.length === 0} className="btn btn-primary !text-xs">
          {pending ? "Granting…" : "Grant extension"}
        </button>
      </div>
    </form>
  );
}
