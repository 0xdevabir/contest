"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ContestRegisterButton({
  contestId,
  registered,
  loggedIn,
}: {
  contestId: string;
  registered: boolean;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!loggedIn) {
    return (
      <Link href="/login" className="btn btn-primary !py-2 !text-xs">
        Login to join
      </Link>
    );
  }

  if (registered) {
    return (
      <span className="rounded-lg bg-[var(--accent-surface)] px-3 py-2 font-mono text-xs text-[var(--accent)]">
        Registered
      </span>
    );
  }

  async function register() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/contests/${contestId}/register`, { method: "POST" });
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

  return (
    <div className="text-right">
      <button
        type="button"
        className="btn btn-primary !py-2 !text-xs"
        disabled={busy}
        onClick={register}
      >
        {busy ? "Joining…" : "Register"}
      </button>
      {msg && <p className="mt-1 text-[11px] text-[var(--danger)]">{msg}</p>}
    </div>
  );
}
