"use client";

import { useEffect, useState } from "react";

const SCOPES = [
  "problems:read",
  "problems:write",
  "contests:read",
  "contests:write",
  "standings:read",
  "submissions:read",
  "submissions:write",
  "sections:read",
  "sections:write",
  "users:read",
] as const;

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [reveal, setReveal] = useState<{ name: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    fetch("/api/profile/api-keys")
      .then((r) => r.json())
      .then((data) => setKeys(data.keys ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  function toggleScope(s: string) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function createKey() {
    if (!name.trim() || scopes.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes }),
      });
      const data = await res.json();
      if (data.ok) {
        setReveal({ name: data.key.name, token: data.token });
        setName("");
        setScopes([]);
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "revoke" | "rotate") {
    setBusy(true);
    try {
      const res = await fetch(`/api/profile/api-keys/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (action === "rotate" && data.ok) setReveal({ name: data.key.name, token: data.token });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-xs text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-6">
      {reveal ? (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-sm font-medium">
            New key for <span className="font-mono">{reveal.name}</span> — copy it now, it won&apos;t be shown again:
          </p>
          <code className="mt-2 block break-all rounded bg-black/30 p-2 text-xs">{reveal.token}</code>
          <button type="button" className="btn btn-ghost mt-2 !py-1 !text-xs" onClick={() => setReveal(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="rounded-lg border border-[var(--line)] p-4">
        <p className="mb-2 text-sm font-medium">New key</p>
        <input
          className="input mb-3 w-full"
          placeholder="Key name (e.g. &quot;CI pipeline&quot;)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
              {s}
            </label>
          ))}
        </div>
        <button type="button" className="btn btn-primary !py-1.5 !text-xs" disabled={busy} onClick={createKey}>
          Create key
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-[var(--line)] font-mono text-[10px] uppercase tracking-wide text-[var(--muted-dim)]">
            <tr>
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Prefix</th>
              <th className="py-2 pr-3 font-medium">Scopes</th>
              <th className="py-2 pr-3 font-medium">Last used</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line-soft)]">
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="py-2 pr-3">{k.name}</td>
                <td className="py-2 pr-3 font-mono text-xs">{k.keyPrefix}…</td>
                <td className="py-2 pr-3 text-xs">{k.scopes.join(", ")}</td>
                <td className="py-2 pr-3 text-xs">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "never"}</td>
                <td className="py-2 pr-3 text-xs">{k.revokedAt ? "revoked" : "active"}</td>
                <td className="py-2 pr-3 text-right">
                  {!k.revokedAt ? (
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-ghost !py-1 !text-xs" disabled={busy} onClick={() => act(k.id, "rotate")}>
                        Rotate
                      </button>
                      <button type="button" className="btn btn-ghost !py-1 !text-xs" disabled={busy} onClick={() => act(k.id, "revoke")}>
                        Revoke
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {keys.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-xs text-[var(--muted)]">
                  No API keys yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
