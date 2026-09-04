"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { flushQueue } from "@/lib/offline/queue";
import { useT } from "@/i18n/LocaleProvider";

/**
 * Registers `public/sw.js` and wires the "update available" + reconnect
 * flows (D4/rollback). Rendered only when the `pwa` flag is on — the
 * counterpart `unregisterServiceWorker()` below is the documented kill
 * switch when it's off.
 */
export function ServiceWorkerRegister() {
  const { dict } = useT();
  const [updateReady, setUpdateReady] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingRef.current = reg.waiting;
          setUpdateReady(true);
        }
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              waitingRef.current = reg.waiting;
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {
        /* offline-first is a progressive enhancement, never a hard requirement */
      });

    // Flush the offline submission queue immediately on mount (a queued
    // submission from a previous session) and again on every reconnect.
    void flushQueue();
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      window.removeEventListener("online", onOnline);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-xl border border-[var(--accent-border)] bg-[var(--bg-panel)] px-4 py-2.5 text-sm shadow-lg"
    >
      <span>{dict.offline.updateAvailable}</span>
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--accent-contrast)]"
        onClick={() => waitingRef.current?.postMessage({ type: "SKIP_WAITING" })}
      >
        <RefreshCw size={12} aria-hidden />
        {dict.offline.reloadToUpdate}
      </button>
    </div>
  );
}

/** Rendered instead of `<ServiceWorkerRegister>` whenever the `pwa` flag is
 * off — actively tears down any service worker + caches left behind from
 * when it was on, rather than just stopping re-registration. */
export function PwaKillSwitch() {
  useEffect(() => {
    void unregisterServiceWorker();
  }, []);
  return null;
}

/** Rollback path (docs/phases/PHASE-14-i18n-pwa.md): unregisters the SW and
 * clears its caches. Exposed for the admin "disable PWA" action and for the
 * `pwa` flag's off-state, since a stale service worker is one of the harder
 * production problems to undo by asking users to clear their browser data. */
export async function unregisterServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}
