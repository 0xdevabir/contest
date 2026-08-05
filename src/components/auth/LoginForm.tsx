"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Guarded against "//evil.com", which is a valid URL that leaves the site.
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/problems";

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
      router.push(destination);
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
        <h1 className="font-display text-2xl font-bold">Log in</h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Practice still works without an account — login saves your progress.
        </p>
      </div>

      <label className="block">
        <span className="field-label">Email</span>
        <input name="email" type="email" required className="field" />
      </label>
      <label className="block">
        <span className="field-label">Password</span>
        <input name="password" type="password" required className="field" />
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


