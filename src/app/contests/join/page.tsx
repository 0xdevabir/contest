"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

export default function JoinContestPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const code = String(data.get("code") || "").trim();
    const password = String(data.get("password") || "");

    try {
      const lookup = await fetch(`/api/contests/by-code/${encodeURIComponent(code)}`);
      const found = await lookup.json();
      if (!lookup.ok || !found.ok) {
        setError(found.message || "No contest matches that code.");
        return;
      }

      const join = await fetch(`/api/contests/${found.contest.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password: password || undefined }),
      });
      const result = await join.json();
      if (!join.ok || !result.ok) {
        setError(result.message || "Could not join that contest.");
        return;
      }
      router.push(`/contests/${found.contest.slug}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="panel p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-[var(--hover)] text-[var(--accent)]">
            <KeyRound size={16} aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-lg font-bold">Join a contest</h1>
            <p className="text-xs text-[var(--muted)]">Enter the code your organiser shared with you.</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-xs font-medium">
            Join code
            <input
              name="code"
              required
              maxLength={16}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="AB3D9FQK"
              className="mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2.5 font-mono text-sm uppercase tracking-widest outline-none focus:border-[var(--accent-dim)]"
            />
          </label>
          <label className="block text-xs font-medium">
            Password (if required)
            <input
              name="password"
              type="password"
              maxLength={200}
              className="mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent-dim)]"
            />
          </label>
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
          <button type="submit" className="btn btn-primary w-full !text-xs" disabled={busy}>
            {busy ? "Joining…" : "Join contest"}
          </button>
        </form>
      </div>
    </div>
  );
}
