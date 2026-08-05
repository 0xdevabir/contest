"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminContestActions({
  contestId,
  status,
  durationMinutes,
}: {
  contestId: string;
  status: string;
  durationMinutes: number;
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
    if (!confirm("Delete this contest?")) return;
    setBusy(true);
    await fetch(`/api/admin/contests/${contestId}`, { method: "DELETE" });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {(status === "DRAFT" || status === "SCHEDULED") && (
        <button
          type="button"
          className="btn btn-primary !py-2 !text-xs"
          disabled={busy}
          onClick={() => patch({ action: "go-live", durationMinutes })}
        >
          Go live
        </button>
      )}
      {status === "LIVE" && (
        <button
          type="button"
          className="btn btn-danger !py-2 !text-xs"
          disabled={busy}
          onClick={() => patch({ action: "end" })}
        >
          End contest
        </button>
      )}
      {status === "DRAFT" && (
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
        className="btn btn-ghost !py-2 !text-xs text-[var(--danger)]"
        disabled={busy}
        onClick={remove}
      >
        Delete
      </button>
      {msg && <p className="text-[11px] text-[var(--danger)]">{msg}</p>}
    </div>
  );
}
