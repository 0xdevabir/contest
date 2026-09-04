"use client";

import { useEffect, useState } from "react";

const EVENTS = [
  "contest.started",
  "contest.ended",
  "submission.judged",
  "assignment.due_soon",
  "problem.published",
  "rating.updated",
] as const;

type ApiKeyOption = { id: string; name: string };
type WebhookRow = {
  id: string;
  apiKeyId: string;
  apiKeyName: string;
  url: string;
  events: string[];
  active: boolean;
  failCount: number;
  createdAt: string;
};
type Delivery = { id: string; event: string; status: number | null; attempt: number; error: string | null; deliveredAt: string | null; createdAt: string };

export function WebhooksManager() {
  const [apiKeys, setApiKeys] = useState<ApiKeyOption[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKeyId, setApiKeyId] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [reveal, setReveal] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [busy, setBusy] = useState(false);

  function refresh() {
    Promise.all([
      fetch("/api/profile/api-keys").then((r) => r.json()),
      fetch("/api/profile/webhooks").then((r) => r.json()),
    ])
      .then(([keysData, webhooksData]) => {
        setApiKeys((keysData.keys ?? []).filter((k: { revokedAt: string | null }) => !k.revokedAt));
        setWebhooks(webhooksData.webhooks ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  function toggleEvent(e: string) {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  async function create() {
    if (!apiKeyId || !url.trim() || events.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeyId, url, events }),
      });
      const data = await res.json();
      if (data.ok) {
        setReveal(data.webhook.secret);
        setUrl("");
        setEvents([]);
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/profile/webhooks/${id}`, { method: "DELETE" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function viewDeliveries(id: string) {
    setOpenId(id);
    const data = await fetch(`/api/profile/webhooks/${id}`).then((r) => r.json());
    setDeliveries(data.deliveries ?? []);
  }

  async function replay(webhookId: string, deliveryId: string) {
    setBusy(true);
    try {
      await fetch(`/api/profile/webhooks/${webhookId}/deliveries/${deliveryId}/replay`, { method: "POST" });
      await viewDeliveries(webhookId);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-xs text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-6">
      {reveal ? (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-sm font-medium">Signing secret — copy it now, it won&apos;t be shown again:</p>
          <code className="mt-2 block break-all rounded bg-black/30 p-2 text-xs">{reveal}</code>
          <button type="button" className="btn btn-ghost mt-2 !py-1 !text-xs" onClick={() => setReveal(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="rounded-lg border border-[var(--line)] p-4">
        <p className="mb-2 text-sm font-medium">New webhook</p>
        {apiKeys.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Create an API key first — a webhook belongs to one.</p>
        ) : (
          <>
            <select className="input mb-3 w-full" value={apiKeyId} onChange={(e) => setApiKeyId(e.target.value)}>
              <option value="">Select an API key…</option>
              {apiKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <input className="input mb-3 w-full" placeholder="https://example.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} />
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {EVENTS.map((e) => (
                <label key={e} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={events.includes(e)} onChange={() => toggleEvent(e)} />
                  {e}
                </label>
              ))}
            </div>
            <button type="button" className="btn btn-primary !py-1.5 !text-xs" disabled={busy} onClick={create}>
              Create webhook
            </button>
          </>
        )}
      </div>

      <div className="space-y-3">
        {webhooks.map((w) => (
          <div key={w.id} className="rounded-lg border border-[var(--line)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-xs break-all">{w.url}</p>
                <p className="text-xs text-[var(--muted)]">
                  {w.apiKeyName} · {w.events.join(", ")} · {w.active ? "active" : `disabled (${w.failCount} failures)`}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost !py-1 !text-xs" onClick={() => viewDeliveries(w.id)}>
                  Deliveries
                </button>
                <button type="button" className="btn btn-ghost !py-1 !text-xs" disabled={busy} onClick={() => remove(w.id)}>
                  Delete
                </button>
              </div>
            </div>
            {openId === w.id ? (
              <div className="mt-3 overflow-x-auto border-t border-[var(--line-soft)] pt-3">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead className="text-[var(--muted-dim)]">
                    <tr>
                      <th className="py-1 pr-2">Event</th>
                      <th className="py-1 pr-2">Status</th>
                      <th className="py-1 pr-2">Attempt</th>
                      <th className="py-1 pr-2">When</th>
                      <th className="py-1 pr-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line-soft)]">
                    {deliveries.map((d) => (
                      <tr key={d.id}>
                        <td className="py-1 pr-2">{d.event}</td>
                        <td className="py-1 pr-2">{d.deliveredAt ? d.status : d.error ?? "pending"}</td>
                        <td className="py-1 pr-2">{d.attempt}</td>
                        <td className="py-1 pr-2">{new Date(d.createdAt).toLocaleString()}</td>
                        <td className="py-1 pr-2 text-right">
                          <button type="button" className="btn btn-ghost !py-0.5 !text-[10px]" disabled={busy} onClick={() => replay(w.id, d.id)}>
                            Replay
                          </button>
                        </td>
                      </tr>
                    ))}
                    {deliveries.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-2 text-center text-[var(--muted)]">
                          No deliveries yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ))}
        {webhooks.length === 0 ? <p className="text-xs text-[var(--muted)]">No webhooks yet.</p> : null}
      </div>
    </div>
  );
}
