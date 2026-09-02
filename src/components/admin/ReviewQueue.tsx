"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { difficultyClass } from "@/lib/difficulty";
import type { Difficulty } from "@/lib/types";

type Item = {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  authorName: string;
  version: number;
  groupCount: number;
  referenceCount: number;
  passingReferences: number;
};

export function ReviewQueue({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/problems/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: notes[id] ?? "" }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "Could not record decision");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">
        Nothing waiting on review right now.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/teacher/problems/${item.id}/edit`} target="_blank" className="font-semibold hover:underline">
                {item.title}
              </Link>
              <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                {item.slug} · v{item.version} · by {item.authorName}
              </p>
            </div>
            <span className={`font-mono text-[10px] uppercase ${difficultyClass(item.difficulty)}`}>{item.difficulty}</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
            <span>{item.groupCount} test group(s)</span>
            <span>
              {item.passingReferences}/{item.referenceCount} reference solution(s) passing
            </span>
          </div>

          <textarea
            placeholder="Optional note for the setter…"
            value={notes[item.id] ?? ""}
            onChange={(e) => setNotes((s) => ({ ...s, [item.id]: e.target.value }))}
            rows={2}
            className="field mt-3 !text-xs"
          />

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => decide(item.id, "approve")}
              className="btn btn-primary !py-1.5 !text-xs disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => decide(item.id, "reject")}
              className="btn btn-ghost !py-1.5 !text-xs text-[var(--danger)] disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
