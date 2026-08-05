"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(fd.get("email") || ""),
          password: String(fd.get("password") || ""),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Login failed");
        return;
      }
      router.push("/sets");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel mx-auto w-full max-w-md space-y-4 p-6">
      <div>
        <h1 className="font-display text-2xl font-700">Log in</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Practice still works without an account — login saves your progress.
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-[var(--muted)]">Email</span>
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 outline-none focus:border-[var(--accent-dim)]"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Password</span>
        <input
          name="password"
          type="password"
          required
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 outline-none focus:border-[var(--accent-dim)]"
        />
      </label>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Log in"}
      </button>

      <div className="flex justify-between text-sm text-[var(--muted)]">
        <Link href="/forgot-password" className="hover:text-[var(--accent)]">
          Forgot password?
        </Link>
        <Link href="/register" className="text-[var(--accent)]">
          Register
        </Link>
      </div>
    </form>
  );
}
