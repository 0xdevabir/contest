"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Step = "email" | "code" | "done";

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode(address: string) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Request failed");
        return;
      }
      setMessage(data.message);
      setStep("code");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function requestCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const address = String(fd.get("email") || "").trim().toLowerCase();
    setEmail(address);
    await sendCode(address);
  }

  async function resetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: String(fd.get("code") || "").trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Reset failed");
        return;
      }
      setStep("done");
      setMessage(data.message);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <div className="panel mx-auto w-full max-w-md space-y-4 p-6">
        <div>
          <p className="eyebrow">Password changed</p>
          <h1 className="font-display mt-2 text-2xl font-bold">You&apos;re all set</h1>
          <p role="status" className="mt-2 text-sm text-[var(--muted)]">
            {message}
          </p>
        </div>
        <Link href="/login" className="btn btn-primary w-full">
          Continue to login
        </Link>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={resetPassword} className="panel mx-auto w-full max-w-md space-y-4 p-6">
        <div>
          <p className="eyebrow">Check your inbox</p>
          <h1 className="font-display mt-2 text-2xl font-bold">Enter reset code</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Enter the 8-digit code sent to <span className="text-[var(--text)]">{email}</span>.
            It expires in 10 minutes.
          </p>
        </div>
        <label className="block">
          <span className="field-label">Reset code</span>
          <input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{8}"
            maxLength={8}
            required
            autoFocus
            placeholder="00000000"
            className="field font-mono text-lg tracking-[0.3em]"
          />
        </label>
        <label className="block">
          <span className="field-label">New password</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="field"
          />
        </label>
        <label className="block">
          <span className="field-label">Confirm password</span>
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="field"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-[var(--accent)]">
            {message}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Updating…" : "Change password"}
        </button>
        <div className="flex items-center justify-between gap-4 text-xs">
          <button
            type="button"
            onClick={() => void sendCode(email)}
            disabled={busy}
            className="text-[var(--muted)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            Resend code
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setMessage("");
              setError("");
            }}
            className="text-[var(--muted)] hover:text-[var(--accent)]"
          >
            Use another email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="panel mx-auto w-full max-w-md space-y-4 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Forgot password</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          We&apos;ll email a one-time code if the account exists.
        </p>
      </div>
      <label className="block">
        <span className="field-label">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={email}
          required
          className="field"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Sending…" : "Send reset code"}
      </button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-[var(--muted)] hover:text-[var(--accent)]">
          Back to login
        </Link>
      </p>
    </form>
  );
}

