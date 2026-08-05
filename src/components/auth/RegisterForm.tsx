"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UNIVERSITIES } from "@/lib/universities";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      password: String(fd.get("password") || ""),
      university: String(fd.get("university") || ""),
      studentId: String(fd.get("studentId") || ""),
      department: String(fd.get("department") || ""),
    };
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Registration failed");
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
        <h1 className="font-display text-2xl font-extrabold">Create account</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Save progress, join contests, climb your university leaderboard.
        </p>
      </div>

      <Field label="Full name" name="name" required />
      <Field label="Email" name="email" type="email" required />
      <Field label="Password (min 8)" name="password" type="password" required minLength={8} />

      <label className="block text-sm">
        <span className="text-[var(--muted)]">University</span>
        <select
          name="university"
          required
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 outline-none focus:border-[var(--accent-dim)]"
          defaultValue="DIU"
        >
          {UNIVERSITIES.map((u) => (
            <option key={u.code} value={u.code}>
              {u.name}
            </option>
          ))}
        </select>
      </label>

      <Field label="Student ID (optional)" name="studentId" />
      <Field label="Department (optional)" name="department" />

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Creating…" : "Register"}
      </button>

      <p className="text-center text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--accent)]">
          Log in
        </Link>
      </p>
    </form>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--muted)]">{props.label}</span>
      <input
        name={props.name}
        type={props.type || "text"}
        required={props.required}
        minLength={props.minLength}
        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 outline-none focus:border-[var(--accent-dim)]"
      />
    </label>
  );
}
