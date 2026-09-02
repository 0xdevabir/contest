"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SCOPES = ["problem", "contest", "version", "submission"] as const;

/** Kicks off a new dry-run rejudge batch and redirects to its diff page. */
export function RejudgeTrigger() {
  const router = useRouter();
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("problem");
  const [scopeId, setScopeId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/teacher/rejudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, scopeId, reason, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(data.message || "Could not start rejudge");
        return;
      }
      router.push(`/admin/rejudge/${data.batchId}`);
    } catch {
      setMessage("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-quiet space-y-3 p-4">
      <p className="text-sm font-semibold">Start a dry-run rejudge</p>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])}
          className="rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] px-2.5 py-2 text-sm"
        >
          {SCOPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={scopeId}
          onChange={(e) => setScopeId(e.target.value)}
          placeholder="Problem / contest / version / submission id"
          className="rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] px-2.5 py-2 text-sm"
        />
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (shown on the audit trail)"
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] px-2.5 py-2 text-sm"
      />
      {message && <p className="text-xs text-[var(--danger)]">{message}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !scopeId || reason.trim().length < 3}
        className="btn btn-primary !px-3 !py-2 !text-xs"
      >
        {busy ? "Starting…" : "Start dry run"}
      </button>
    </div>
  );
}
