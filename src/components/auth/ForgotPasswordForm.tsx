"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Step = "email" | "code" | "password" | "done";

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function clearAlerts() {
    setError("");
    setMessage("");
  }

  async function sendCode(address: string) {
    clearAlerts();
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
        return false;
      }
      setMessage(data.message);
      setStep("code");
      setCode("");
      return true;
    } catch {
      setError("Network error");
      return false;
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

  async function verifyCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearAlerts();
    const fd = new FormData(e.currentTarget);
    const nextCode = String(fd.get("code") || "").replace(/\D/g, "").slice(0, 8);
    setCode(nextCode);
    if (nextCode.length !== 8) {
      setError("Enter the 8-digit code from your email");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: nextCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Invalid or expired code");
        return;
      }
      setMessage("");
      setStep("password");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearAlerts();
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
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Reset failed");
        // Code may have expired between verify and submit — send them back.
        if (res.status === 400) {
          setStep("code");
          setCode("");
        }
        return;
      }
      setStep("done");
      setMessage(data.message);
      setCode("");
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

  if (step === "password") {
    return (
      <form onSubmit={resetPassword} className="panel mx-auto w-full max-w-md space-y-4 p-6">
        <div>
          <p className="eyebrow">Step 3 of 3</p>
          <h1 className="font-display mt-2 text-2xl font-bold">Choose a new password</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Code verified for <span className="text-[var(--text)]">{email}</span>.
          </p>
        </div>
        {/* Keep username in the form so password managers never invent one. */}
        <input type="hidden" name="username" value={email} autoComplete="username" />
        <label className="block">
          <span className="field-label">New password</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            autoFocus
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
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Updating…" : "Change password"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("code");
            clearAlerts();
          }}
          className="w-full text-center text-xs text-[var(--muted)] hover:text-[var(--accent)]"
        >
          Back to code
        </button>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} className="panel mx-auto w-full max-w-md space-y-4 p-6">
        <div>
          <p className="eyebrow">Step 2 of 3</p>
          <h1 className="font-display mt-2 text-2xl font-bold">Enter reset code</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Enter the 8-digit code sent to <span className="text-[var(--text)]">{email}</span>.
            It expires in 10 minutes.
          </p>
        </div>
        {/* Soak up username autofill so it cannot land in the OTP field. */}
        <input
          type="text"
          name="username"
          value={email}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="username"
          className="sr-only"
        />
        <label className="block">
          <span className="field-label">Reset code</span>
          <input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            pattern="[0-9]{8}"
            maxLength={8}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="00000000"
            className="field font-mono text-lg tracking-[0.3em]"
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
        <button type="submit" className="btn btn-primary w-full" disabled={busy || code.length !== 8}>
          {busy ? "Checking…" : "Verify code"}
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
              setCode("");
              clearAlerts();
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
        <p className="eyebrow">Step 1 of 3</p>
        <h1 className="font-display mt-2 text-2xl font-bold">Forgot password</h1>
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
          autoFocus
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
