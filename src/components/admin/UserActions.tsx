"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Shield, Trash2, UserRoundX } from "lucide-react";

export function UserActions({
  userId,
  role,
  status,
  verified,
  isSelf,
}: {
  userId: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  verified: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function update(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setMessage(result.message || "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setMessage("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        "Permanently delete this user? Their saved progress and registrations will be removed."
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setMessage(result.message || "Delete failed");
        return;
      }
      router.refresh();
    } catch {
      setMessage("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-40 flex-col items-end">
      <div className="flex items-center gap-1">
        {!verified && (
          <button
            type="button"
            onClick={() => void update({ emailVerified: true })}
            disabled={busy}
            className="grid size-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--accent)]"
            title="Mark email verified"
            aria-label="Mark email verified"
          >
            <CheckCircle2 size={14} />
          </button>
        )}
        {!isSelf && (
          <>
            <button
              type="button"
              onClick={() => void update({ role: role === "ADMIN" ? "USER" : "ADMIN" })}
              disabled={busy}
              className="grid size-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--info)]"
              title={role === "ADMIN" ? "Remove admin role" : "Promote to admin"}
              aria-label={role === "ADMIN" ? "Remove admin role" : "Promote to admin"}
            >
              <Shield size={14} />
            </button>
            <button
              type="button"
              onClick={() =>
                void update({ status: status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })
              }
              disabled={busy}
              className={`grid size-8 place-items-center rounded-lg border border-[var(--line)] ${
                status === "SUSPENDED"
                  ? "text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--warn)]"
              }`}
              title={status === "ACTIVE" ? "Suspend account" : "Reactivate account"}
              aria-label={status === "ACTIVE" ? "Suspend account" : "Reactivate account"}
            >
              <UserRoundX size={14} />
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="grid size-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--danger)]"
              title="Delete user"
              aria-label="Delete user"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
      {message && (
        <p role="status" className="mt-1 max-w-48 text-right text-[10px] text-[var(--danger)]">
          {message}
        </p>
      )}
    </div>
  );
}
