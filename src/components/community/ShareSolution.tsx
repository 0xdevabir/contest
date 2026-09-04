"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

/** Opt-in, post-solve-only sharing (D1) — surfaced next to the AC
 * celebration once a submission is Accepted. */
export function ShareSolution({ submissionId }: { submissionId: string }) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function share() {
    setStatus("busy");
    const res = await fetch("/api/solutions/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, note }),
    });
    setStatus(res.ok ? "done" : "error");
  }

  if (status === "done") {
    return <p className="mt-3 text-xs text-[var(--accent)]">Your solution is now visible to others who&apos;ve solved this problem.</p>;
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--line)] p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text)]">
        <Share2 size={12} aria-hidden />
        Share this solution
      </p>
      <p className="mt-1 text-[11px] text-[var(--muted)]">
        Visible only to other students who&apos;ve solved this problem. Optional.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="A short note on your approach (optional)"
        rows={2}
        maxLength={500}
        className="mt-2 w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--bg)] p-2 text-xs outline-none focus:border-[var(--accent-border)]"
      />
      <button type="button" disabled={status === "busy"} onClick={share} className="btn btn-ghost !mt-2 !py-1.5 !text-[11px]">
        {status === "busy" ? "Sharing…" : "Share"}
      </button>
      {status === "error" ? <p className="mt-1 text-[11px] text-[var(--danger)]">Could not share that submission.</p> : null}
    </div>
  );
}
