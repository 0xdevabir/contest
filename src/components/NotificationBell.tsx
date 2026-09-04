"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/** The community notification centre's live bell (D-scope: "in-app, email,
 * web push" — this is the in-app half). Polls once on mount, then stays
 * live via SSE (src/app/api/notifications/stream/route.ts). */
export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    fetch("/api/notifications?take=20")
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setItems(data.notifications ?? []);
          setUnread(data.unreadCount ?? 0);
        }
      })
      .catch(() => undefined);
  }, [open, loaded]);

  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    es.addEventListener("notification", () => {
      setUnread((n) => n + 1);
      setLoaded(false);
    });
    es.onerror = () => {
      // The browser retries SSE connections automatically; nothing to do.
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(
      () => undefined
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        className="relative inline-flex size-8 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
      >
        <Bell size={15} aria-hidden />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 flex min-w-[16px] items-center justify-center rounded-full border border-[var(--warn)]/40 bg-[var(--warn-surface)] px-1 text-[9px] font-semibold text-[var(--warn)]">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
            <span className="text-xs font-medium text-[var(--muted)]">Notifications</span>
            {unread > 0 ? (
              <button type="button" onClick={markAllRead} className="text-[11px] text-[var(--accent)] hover:underline">
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">No notifications yet.</p>
            ) : (
              items.map((n) => {
                const row = (
                  <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-[var(--hover)]">
                    {!n.readAt ? (
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
                    ) : (
                      <span className="mt-1.5 size-1.5 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-[var(--text)]">{n.title}</span>
                      {n.body ? <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">{n.body}</span> : null}
                      <span className="mt-0.5 block font-mono text-[10px] text-[var(--muted-dim)]">{timeAgo(n.createdAt)}</span>
                    </span>
                  </div>
                );
                return n.href ? (
                  <Link key={n.id} href={n.href} onClick={() => setOpen(false)}>
                    {row}
                  </Link>
                ) : (
                  <div key={n.id}>{row}</div>
                );
              })
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-[var(--line)] px-3 py-2 text-center text-[11px] text-[var(--accent)] hover:bg-[var(--hover)]"
          >
            View all
          </Link>
        </div>
      ) : null}
    </div>
  );
}
