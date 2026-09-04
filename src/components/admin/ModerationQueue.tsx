"use client";

import { useState } from "react";

type Report = {
  id: string;
  target: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter: { name: string; email: string } | null;
};

export function ModerationQueue({ initial }: { initial: Report[] }) {
  const [reports, setReports] = useState(initial);

  async function resolve(id: string, status: "ACTIONED" | "DISMISSED", hideTarget: boolean) {
    setReports((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/admin/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, hideTarget }),
    }).catch(() => undefined);
  }

  if (reports.length === 0) {
    return <p className="panel px-5 py-10 text-center text-sm text-[var(--muted)]">No open reports.</p>;
  }

  return (
    <div className="panel divide-y divide-[var(--line)] overflow-hidden">
      {reports.map((r) => (
        <div key={r.id} className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--accent)]">{r.target}</span>
            <span className="font-mono text-[10px] text-[var(--muted-dim)]">{new Date(r.createdAt).toLocaleString()}</span>
          </div>
          <p className="mt-1.5 text-sm">{r.reason}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Reported by {r.reporter?.name ?? "unknown"} · target id <span className="font-mono">{r.targetId}</span>
          </p>
          <div className="mt-3 flex gap-2">
            {r.target === "comment" ? (
              <button
                type="button"
                onClick={() => resolve(r.id, "ACTIONED", true)}
                className="btn btn-ghost !py-1.5 !text-xs !text-[var(--danger)]"
              >
                Hide content &amp; action
              </button>
            ) : (
              <button type="button" onClick={() => resolve(r.id, "ACTIONED", false)} className="btn btn-ghost !py-1.5 !text-xs">
                Mark actioned
              </button>
            )}
            <button type="button" onClick={() => resolve(r.id, "DISMISSED", false)} className="btn btn-ghost !py-1.5 !text-xs">
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
