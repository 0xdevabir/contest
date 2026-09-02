"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";

type Row = {
  submissionId: string;
  userName: string;
  userEmail: string;
  problemId: string;
  oldVerdict: string;
  oldScore: number;
  newVerdict: string | null;
  newScore: number | null;
  pending: boolean;
};

type Batch = {
  id: string;
  scope: string;
  scopeId: string;
  reason: string;
  dryRun: boolean;
  total: number;
  completed: number;
  changed: number;
  diffSummary: Record<string, number>;
  appliedAt: string | null;
  createdAt: string;
  createdBy: { name: string; email: string };
};

const POLL_MS = 2000;

export function RejudgeDiff({ batchId }: { batchId: string }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/teacher/rejudge/${batchId}`);
    const data = await res.json();
    if (data.ok) {
      setBatch(data.batch);
      setRows(data.rows);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
    const finished = () => batch && batch.completed >= batch.total;
    if (finished()) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, batch?.completed, batch?.total]);

  async function apply() {
    setApplying(true);
    setMessage("");
    try {
      const res = await fetch(`/api/teacher/rejudge/${batchId}/apply`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(data.message || "Apply failed");
        return;
      }
      await load();
    } catch {
      setMessage("Network error");
    } finally {
      setApplying(false);
    }
  }

  if (!batch) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-[var(--muted)]">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Loading batch…
      </div>
    );
  }

  const done = batch.completed >= batch.total;
  const canApply = batch.dryRun && !batch.appliedAt && done;

  return (
    <div className="space-y-4">
      <div className="panel-quiet flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">{batch.reason}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {batch.scope} · {batch.scopeId} · started by {batch.createdBy.name}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono">
            {batch.completed}/{batch.total} judged
          </span>
          <span className="font-mono text-[var(--warn)]">{batch.changed} changed</span>
          {!done && <RefreshCw size={13} className="animate-spin text-[var(--muted)]" aria-hidden />}
          {batch.appliedAt ? (
            <span className="inline-flex items-center gap-1 text-[var(--accent)]">
              <CheckCircle2 size={13} aria-hidden />
              Applied
            </span>
          ) : (
            canApply && (
              <button type="button" onClick={() => void apply()} disabled={applying} className="btn btn-primary !px-3 !py-1.5 !text-xs">
                {applying ? "Applying…" : "Apply changes"}
              </button>
            )
          )}
        </div>
      </div>

      {message && <p className="text-xs text-[var(--danger)]">{message}</p>}

      {Object.keys(batch.diffSummary).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(batch.diffSummary).map(([transition, count]) => (
            <span key={transition} className="badge border-[var(--warn-border)] bg-[var(--warn-surface)] text-[var(--warn)]">
              {transition}: {count}
            </span>
          ))}
        </div>
      )}

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="border-b border-[var(--line)] bg-[var(--sunken)] text-[10px] uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Student</th>
                <th className="px-4 py-2.5 font-medium">Problem</th>
                <th className="px-4 py-2.5 font-medium">Old verdict</th>
                <th className="px-4 py-2.5 font-medium">New verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {rows.map((r) => {
                const changed = r.newVerdict != null && r.newVerdict !== r.oldVerdict;
                return (
                  <tr key={r.submissionId}>
                    <td className="px-4 py-2.5">{r.userName}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--muted)]">{r.problemId}</td>
                    <td className="px-4 py-2.5 font-mono">{r.oldVerdict} ({r.oldScore})</td>
                    <td className={`px-4 py-2.5 font-mono ${changed ? "font-semibold text-[var(--warn)]" : "text-[var(--muted)]"}`}>
                      {r.pending ? "…" : r.newVerdict != null ? `${r.newVerdict} (${r.newScore})` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
