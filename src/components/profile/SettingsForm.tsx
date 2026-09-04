"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ThemePicker } from "@/components/ThemePicker";
import { LocaleToggle } from "@/components/LocaleToggle";
import { InstitutionPicker, type InstitutionOption } from "@/components/InstitutionPicker";

type Initial = {
  name: string;
  email: string;
  bio: string;
  institutionId: string;
  institutionVerified: boolean;
  studentId: string;
  department: string;
  editorFontSize: number;
  profilePublic: boolean;
  showEmail: boolean;
};

export function SettingsForm({
  initial,
  institutions,
}: {
  initial: Initial;
  institutions: InstitutionOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [instMsg, setInstMsg] = useState<string | null>(null);
  const [instErr, setInstErr] = useState<string | null>(null);
  const [instPending, setInstPending] = useState(false);

  async function saveProfile(fd: FormData) {
    setMsg(null);
    setErr(null);
    // Theme is not part of this payload — ThemePicker saves on click so the
    // change is visible immediately.
    const body = {
      name: String(fd.get("name") || ""),
      bio: String(fd.get("bio") || ""),
      studentId: String(fd.get("studentId") || "") || null,
      department: String(fd.get("department") || "") || null,
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
    try {
      localStorage.setItem("diu_editor_font", String(body.editorFontSize));
    } catch {
      /* ignore */
    }
    setMsg("Saved.");
    startTransition(() => router.refresh());
  }

  async function saveInstitution(fd: FormData) {
    setInstMsg(null);
    setInstErr(null);
    setInstPending(true);
    try {
      const res = await fetch("/api/profile/institution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: String(fd.get("institutionId") || "") }),
      });
      const data = (await res.json()) as { ok: boolean; verified?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setInstErr(data.message || "Could not save.");
        return;
      }
      setInstMsg(data.verified ? "Saved — verified automatically." : "Saved. Not yet verified.");
      startTransition(() => router.refresh());
    } finally {
      setInstPending(false);
    }
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
            <span className="field-label">Department</span>
            <input
              name="department"
              defaultValue={initial.department}
              className="field mt-1.5"
              placeholder="CSE"
            />
          </label>
          <label className="block">
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
          <p className="mt-1 text-xs text-[var(--muted)]">
            Themes apply the moment you pick one and are saved to your account.
          </p>
          <div className="mt-4">
            <span className="field-label">Theme</span>
            <div className="mt-1.5">
              <ThemePicker />
            </div>
          </div>
          <div className="mt-4">
            <span className="field-label">Language</span>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Switches the whole site — problem statements keep their own toggle when a
              Bangla version exists.
            </p>
            <div className="mt-1.5">
              <LocaleToggle />
            </div>
          </div>
          <label className="mt-4 block sm:max-w-xs">
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
        className="panel space-y-4 p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void saveInstitution(new FormData(e.currentTarget));
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold">Institution</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Drives your campus leaderboard rank and national board eligibility.
            </p>
          </div>
          {initial.institutionId && (
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[10px] ${
                initial.institutionVerified
                  ? "border-[var(--accent-dim)] text-[var(--accent)]"
                  : "border-[var(--warn)]/40 text-[var(--warn)]"
              }`}
            >
              {initial.institutionVerified ? "VERIFIED" : "NOT VERIFIED"}
            </span>
          )}
        </div>
        <InstitutionPicker
          name="institutionId"
          institutions={institutions}
          defaultValue={initial.institutionId}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-ghost !py-2 !text-xs" disabled={instPending}>
            {instPending ? "Saving…" : "Save institution"}
          </button>
          {instMsg ? <span className="text-xs text-[var(--accent)]">{instMsg}</span> : null}
          {instErr ? <span className="text-xs text-[var(--danger)]">{instErr}</span> : null}
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

      <SessionsPanel />
    </div>
  );
}

type SessionView = {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/profile/sessions");
      const data = (await res.json()) as { ok: boolean; sessions?: SessionView[] };
      if (data.ok && data.sessions) setSessions(data.sessions);
    } catch {
      setError("Could not load sessions.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(sessionId?: string) {
    setBusyId(sessionId ?? "all");
    setError(null);
    try {
      const res = await fetch("/api/auth/sessions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionId ? { sessionId } : {}),
      });
      if (!res.ok) {
        setError("Could not sign out that device.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold">Active sessions</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Devices currently signed in.</p>
        </div>
        {sessions && sessions.length > 1 && (
          <button
            type="button"
            onClick={() => void revoke(undefined)}
            disabled={busyId !== null}
            className="btn btn-ghost !py-2 !text-xs"
          >
            Sign out all other devices
          </button>
        )}
      </div>

      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

      {!sessions ? (
        <p className="text-xs text-[var(--muted)]">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No active sessions.</p>
      ) : (
        <ul className="divide-y divide-[var(--line-soft)]">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate">
                  {s.userAgent ? summarizeUserAgent(s.userAgent) : "Unknown device"}
                  {s.isCurrent && (
                    <span className="ml-1.5 text-[11px] font-normal text-[var(--accent)]">
                      this device
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                  Last active {new Date(s.lastSeenAt).toLocaleString()}
                  {s.ip ? ` · ${s.ip}` : ""}
                </p>
              </div>
              {!s.isCurrent && (
                <button
                  type="button"
                  onClick={() => void revoke(s.id)}
                  disabled={busyId !== null}
                  className="btn btn-ghost shrink-0 !py-1.5 !text-xs"
                >
                  {busyId === s.id ? "Signing out…" : "Sign out"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function summarizeUserAgent(ua: string): string {
  if (/iphone|ipad/i.test(ua)) return "iOS device";
  if (/android/i.test(ua)) return "Android device";
  if (/mac os/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows PC";
  if (/linux/i.test(ua)) return "Linux";
  return "Browser";
}
