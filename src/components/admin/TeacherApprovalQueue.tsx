"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

type PendingTeacher = {
  id: string;
  name: string;
  email: string;
  teacherRequestNote: string | null;
  createdAt: string;
  emailVerified: boolean;
  institution: { name: string; shortName: string } | null;
};

export function TeacherApprovalQueue({ pending }: { pending: PendingTeacher[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/teachers/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Could not approve");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    if (!reason.trim()) {
      setError("Give a reason before rejecting");
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/teachers/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Could not reject");
        return;
      }
      setRejectingId(null);
      setReason("");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (pending.length === 0) {
    return (
      <div className="panel px-6 py-12 text-center">
        <CheckCircle2 className="mx-auto text-[var(--muted-dim)]" size={26} aria-hidden />
        <p className="mt-3 text-sm text-[var(--muted)]">No pending teacher requests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {pending.map((t) => (
        <div key={t.id} className="panel p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{t.name}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {t.email} · {t.institution?.name ?? "Unaffiliated"}
                {!t.emailVerified && (
                  <span className="ml-1.5 text-[var(--warn)]">· email unverified</span>
                )}
              </p>
              {t.teacherRequestNote && (
                <p className="mt-2 max-w-xl rounded-md bg-[var(--hover)] px-3 py-2 text-xs text-[var(--muted)]">
                  {t.teacherRequestNote}
                </p>
              )}
              <p className="mt-2 text-[10px] text-[var(--muted-dim)]">
                Requested {new Date(t.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => void approve(t.id)}
                disabled={busyId === t.id}
                className="btn btn-primary !py-1.5 !text-xs"
              >
                <CheckCircle2 size={13} />
                Approve
              </button>
              <button
                type="button"
                onClick={() => setRejectingId(rejectingId === t.id ? null : t.id)}
                disabled={busyId === t.id}
                className="btn btn-ghost !py-1.5 !text-xs"
              >
                <XCircle size={13} />
                Reject
              </button>
            </div>
          </div>
          {rejectingId === t.id && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line-soft)] pt-3">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (sent to the applicant)…"
                className="field flex-1 !py-1.5 !text-xs"
              />
              <button
                type="button"
                onClick={() => void reject(t.id)}
                disabled={busyId === t.id}
                className="btn btn-ghost !py-1.5 !text-xs text-[var(--danger)]"
              >
                Confirm reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
