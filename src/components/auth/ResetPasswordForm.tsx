"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");
    if (password !== confirm) {
      setError("Passwords do not match");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Reset failed");
        return;
      }
      router.push("/login");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="panel mx-auto max-w-md p-6 text-sm text-[var(--danger)]">
        Missing reset token. Request a new link from{" "}
        <Link href="/forgot-password" className="text-[var(--accent)]">
          forgot password
        </Link>
        .
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="panel mx-auto w-full max-w-md space-y-4 p-6">
      <h1 className="font-display text-2xl font-700">Set new password</h1>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">New password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 outline-none focus:border-[var(--accent-dim)]"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Confirm password</span>
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 outline-none focus:border-[var(--accent-dim)]"
        />
      </label>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
