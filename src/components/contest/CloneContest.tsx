"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";

/** docs/phases/PHASE-05-contest-engine.md — clone a contest into a new draft
 * with the same problems and settings, and no participants. */
export function CloneContest({ contestId }: { contestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function clone() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/teacher/contests/${contestId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) {
        setError(result.message || "Could not clone contest.");
        return;
      }
      router.push(`/teacher/contests/${result.contest.id}`);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn btn-ghost !py-2 !text-xs" disabled={busy} onClick={clone}>
        <Copy size={13} aria-hidden="true" />
        {busy ? "Cloning…" : "Clone"}
      </button>
      {error && <span className="text-[11px] text-[var(--danger)]">{error}</span>}
    </div>
  );
}
