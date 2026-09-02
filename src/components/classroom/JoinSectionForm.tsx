"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinSectionForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/sections/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteCode: form.get("inviteCode") }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? "Could not join with that code");
      return;
    }
    router.push(`/courses/${data.sectionId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Join by code</span>
        <input
          name="inviteCode"
          required
          maxLength={16}
          placeholder="ABCD1234"
          className="w-40 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-xs uppercase"
        />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary !text-xs">
        {pending ? "Joining…" : "Join"}
      </button>
      {error && <p className="w-full text-xs text-[var(--danger)]">{error}</p>}
    </form>
  );
}
