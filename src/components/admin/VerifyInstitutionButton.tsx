"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VerifyInstitutionButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/verify-institution`, {
        method: "POST",
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void verify()}
      disabled={busy}
      className="rounded-md border border-[var(--accent-dim)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent)] hover:bg-[var(--accent-surface)]"
    >
      {busy ? "Verifying…" : "Verify manually"}
    </button>
  );
}
