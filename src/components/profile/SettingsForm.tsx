"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";
import { UNIVERSITIES } from "@/lib/universities";

type Initial = {
  name: string;
  email: string;
  bio: string;
  university: string;
  studentId: string;
  department: string;
  theme: "SYSTEM" | "DARK" | "LIGHT";
  editorFontSize: number;
  profilePublic: boolean;
  showEmail: boolean;
};

export function SettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  async function saveProfile(fd: FormData) {
    setMsg(null);
    setErr(null);
    const theme = String(fd.get("theme") || "DARK") as "SYSTEM" | "DARK" | "LIGHT";
    const body = {
      name: String(fd.get("name") || ""),
      bio: String(fd.get("bio") || ""),
      university: String(fd.get("university") || ""),
      studentId: String(fd.get("studentId") || "") || null,
      department: String(fd.get("department") || "") || null,
      theme,
      editorFontSize: Number(fd.get("editorFontSize") || 14),
      profilePublic: fd.get("profilePublic") === "on",
      showEmail: fd.get("showEmail") === "on",
    };
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; message?: string };
    if (!res.ok || !data.ok) {
      setErr(data.message || "Could not save.");
      return;
    }
    setTheme(theme.toLowerCase() as ThemeMode);
    try {
      localStorage.setItem("diu_editor_font", String(body.editorFontSize));
    } catch {
      /* ignore */
    }
    setMsg("Saved.");
    startTransition(() => router.refresh());
  }

  async function changePassword(fd: FormData) {
    setPwMsg(null);
    setPwErr(null);
    const res = await fetch("/api/profile/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: String(fd.get("currentPassword") || ""),
        newPassword: String(fd.get("newPassword") || ""),
      }),
    });
    const data = (await res.json()) as { ok: boolean; message?: string };
    if (!res.ok || !data.ok) {
      setPwErr(data.message || "Could not update password.");
      return;
    }
    setPwMsg("Password updated.");
    (document.getElementById("password-form") as HTMLFormElement | null)?.reset();
  }

  return (
    <div className="space-y-8">
      <form
        className="panel space-y-5 p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void saveProfile(new FormData(e.currentTarget));
        }}
      >
        <div>
          <h2 className="font-display text-lg font-bold">Account</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            How you appear on the leaderboard and public profile.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="field-label">Display name</span>
            <input name="name" defaultValue={initial.name} required className="field mt-1.5" />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Email</span>
            <input
              value={initial.email}
              disabled
              className="field mt-1.5 opacity-60"
              title="Email cannot be changed here"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Bio</span>
            <textarea
              name="bio"
              defaultValue={initial.bio}
              rows={3}
              maxLength={280}
              className="field mt-1.5 resize-y"
              placeholder="One or two lines about how you practice…"
            />
          </label>
          <label className="block">
            <span className="field-label">University</span>
            <select name="university" defaultValue={initial.university} className="field mt-1.5">
              {UNIVERSITIES.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.shortName} — {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Department</span>
            <input
              name="department"
              defaultValue={initial.department}
              className="field mt-1.5"
              placeholder="CSE"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Student ID</span>
            <input
              name="studentId"
              defaultValue={initial.studentId}
              className="field mt-1.5"
              placeholder="Optional — only you can see this"
            />
          </label>
        </div>

        <div className="border-t border-[var(--line-soft)] pt-5">
          <h3 className="font-display text-base font-bold">Appearance</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Theme</span>
              <select name="theme" defaultValue={initial.theme} className="field mt-1.5">
                <option value="DARK">Dark</option>
                <option value="LIGHT">Light</option>
                <option value="SYSTEM">System</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Editor font size</span>
              <input
                name="editorFontSize"
                type="number"
                min={12}
                max={20}
                defaultValue={initial.editorFontSize}
                className="field mt-1.5"
              />
            </label>
          </div>
        </div>

        <div className="border-t border-[var(--line-soft)] pt-5">
          <h3 className="font-display text-base font-bold">Privacy</h3>
          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="profilePublic"
                defaultChecked={initial.profilePublic}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Public profile</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Anyone with your profile link can see solves and ranks.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="showEmail"
                defaultChecked={initial.showEmail}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Show email publicly</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Off by default. Only applies when the profile is public.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary !py-2 !text-xs" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </button>
          {msg ? <span className="text-xs text-[var(--accent)]">{msg}</span> : null}
          {err ? <span className="text-xs text-[var(--danger)]">{err}</span> : null}
        </div>
      </form>

      <form
        id="password-form"
        className="panel space-y-5 p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void changePassword(new FormData(e.currentTarget));
        }}
      >
        <div>
          <h2 className="font-display text-lg font-bold">Password</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Change the password you use to sign in.
          </p>
        </div>
        <label className="block">
          <span className="field-label">Current password</span>
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="field mt-1.5"
          />
        </label>
        <label className="block">
          <span className="field-label">New password</span>
          <input
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="field mt-1.5"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-ghost !py-2 !text-xs">
            Update password
          </button>
          {pwMsg ? <span className="text-xs text-[var(--accent)]">{pwMsg}</span> : null}
          {pwErr ? <span className="text-xs text-[var(--danger)]">{pwErr}</span> : null}
        </div>
      </form>
    </div>
  );
}
