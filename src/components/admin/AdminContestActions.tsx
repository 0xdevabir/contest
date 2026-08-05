"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleStop, EyeOff, Play, Trash2 } from "lucide-react";

export function AdminContestActions({
  contestId,
  status,
  durationMinutes,
  compact = false,
}: {
  contestId: string;
  status: string;
  durationMinutes: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/contests/${contestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsg(data.message || "Failed");
        return;
      }
      router.refresh();
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this contest permanently? Registrations and contest submissions will also be removed.")) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const response = await fetch(`/api/admin/contests/${contestId}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setMsg(result.message || "Delete failed");
        return;
      }
      router.push("/admin/contests");
      router.refresh();
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "flex-wrap justify-end"}`}>
      {(status === "DRAFT" || status === "SCHEDULED") && (
        <button
          type="button"
          className="btn btn-primary !py-2 !text-xs"
          disabled={busy}
          onClick={() => {
            if (confirm("Activate this contest now? Users will be able to see and join it immediately.")) {
              void patch({ action: "go-live", durationMinutes });
            }
          }}
          title="Activate contest for users"
        >
          <Play size={13} aria-hidden="true" />
          {compact ? "Live" : "Activate"}
        </button>
      )}
      {status === "LIVE" && (
        <>
          <button
            type="button"
            className="btn btn-ghost !py-2 !text-xs"
            disabled={busy}
            onClick={() => {
              if (confirm("Deactivate this contest? Users will no longer see or join it.")) {
                void patch({ action: "deactivate" });
              }
            }}
            title="Hide contest from users"
          >
            <EyeOff size={13} aria-hidden="true" />
            {compact ? "Hide" : "Deactivate"}
          </button>
          <button
            type="button"
            className="btn btn-danger !py-2 !text-xs"
            disabled={busy}
            onClick={() => {
              if (confirm("End this live contest now?")) {
                void patch({ action: "end" });
              }
            }}
          >
            <CircleStop size={13} aria-hidden="true" />
            {compact ? "End" : "End contest"}
          </button>
        </>
      )}
      {status === "DRAFT" && !compact && (
        <button
          type="button"
          className="btn btn-ghost !py-2 !text-xs"
          disabled={busy}
          onClick={() =>
            patch({
              action: "schedule",
              startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            })
          }
        >
          Schedule (+1h)
        </button>
      )}
      <button
        type="button"
        className={`${compact ? "grid size-8 place-items-center rounded-lg border border-[var(--line)]" : "btn btn-ghost !py-2 !text-xs"} text-[var(--danger)]`}
        disabled={busy}
        onClick={remove}
        title="Delete contest"
        aria-label="Delete contest"
      >
        <Trash2 size={13} aria-hidden="true" />
        {!compact && "Delete"}
      </button>
      {msg && <p className="w-full text-right text-[11px] text-[var(--danger)]">{msg}</p>}
    </div>
  );
}


