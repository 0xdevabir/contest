"use client";

import { useEffect, useState } from "react";

type ChannelType = "INAPP" | "EMAIL" | "PUSH";
type TypeRow = { type: string; label: string; channels: ChannelType[] };

const CHANNELS: { id: ChannelType; label: string }[] = [
  { id: "INAPP", label: "In-app" },
  { id: "EMAIL", label: "Email" },
  { id: "PUSH", label: "Push" },
];

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationPreferencesForm() {
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPushSupported(typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window);
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setTypes(data.types);
          setDigestEnabled(Boolean(data.digestEnabled));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggleChannel(type: string, channel: ChannelType) {
    setTypes((prev) =>
      prev.map((t) => {
        if (t.type !== type) return t;
        const has = t.channels.includes(channel);
        const channels = has ? t.channels.filter((c) => c !== channel) : [...t.channels, channel];
        void fetch("/api/notifications/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, channels }),
        });
        return { ...t, channels };
      })
    );
  }

  async function toggleDigest() {
    const next = !digestEnabled;
    setDigestEnabled(next);
    await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digestEnabled: next }),
    }).catch(() => undefined);
  }

  async function enablePush() {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) return;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
      });
      setPushEnabled(true);
    } catch {
      // permission denied, or unsupported — nothing to recover from here
    }
  }

  if (loading) return <p className="text-xs text-[var(--muted)]">Loading…</p>;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-[var(--line)] font-mono text-[10px] uppercase tracking-wide text-[var(--muted-dim)]">
            <tr>
              <th className="py-2 pr-3 font-medium">Notification</th>
              {CHANNELS.map((c) => (
                <th key={c.id} className="px-2 py-2 text-center font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line-soft)]">
            {types.map((t) => (
              <tr key={t.type}>
                <td className="py-2 pr-3">{t.label}</td>
                {CHANNELS.map((c) => (
                  <td key={c.id} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={t.channels.includes(c.id)}
                      onChange={() => toggleChannel(t.type, c.id)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={digestEnabled} onChange={toggleDigest} />
          One daily digest email instead of individual emails
        </label>
        {pushSupported ? (
          <button type="button" onClick={enablePush} disabled={pushEnabled} className="btn btn-ghost !py-1.5 !text-xs">
            {pushEnabled ? "Push enabled" : "Enable browser push"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
