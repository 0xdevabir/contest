"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

type Balloon = { id: string; problemId: string; label: string; color: string; createdAt: string; recipient: string };

/** D — one big "Delivered" button per row, ordered by age (docs/phases/PHASE-07-live-contest.md). */
export function BalloonQueue({ contestId }: { contestId: string }) {
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/contests/${contestId}/balloons`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setBalloons(d.balloons);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestId]);

  async function deliver(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/contests/${contestId}/balloons/${id}/deliver`, { method: "POST" });
      const d = await res.json();
      if (d.ok) setBalloons((prev) => prev.filter((b) => b.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  if (balloons.length === 0) {
    return <div className="panel px-5 py-14 text-center text-sm text-[var(--muted)]">Nothing to deliver right now.</div>;
  }

  return (
    <ul className="space-y-2.5">
      {balloons.map((b) => (
        <li key={b.id} className="panel flex items-center justify-between gap-3 p-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-8 w-8 shrink-0 rounded-full border-2 border-black/10" style={{ backgroundColor: b.color }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{b.recipient}</p>
              <p className="font-mono text-xs text-[var(--muted)]">
                {b.label} · {new Date(b.createdAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busyId === b.id}
            onClick={() => deliver(b.id)}
            className="btn btn-primary shrink-0 !px-4 !py-2.5"
          >
            <Check size={14} aria-hidden="true" />
            Delivered
          </button>
        </li>
      ))}
    </ul>
  );
}
