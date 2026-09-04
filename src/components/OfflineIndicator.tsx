"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { useT } from "@/i18n/LocaleProvider";
import { listQueued, onQueueChanged, onSubmissionSent } from "@/lib/offline/queue";
import { plural } from "@/i18n/format";

/**
 * Persistent badge for offline state + queued-submission count (D4): "a
 * student must know their submission is queued, not judged." Renders
 * nothing when online with an empty queue, so it never adds visual noise
 * on a normal connection.
 */
export function OfflineIndicator() {
  const { t, dict } = useT();
  const [online, setOnline] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);
  const [justSent, setJustSent] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listQueued().then((items) => {
        if (!cancelled) setQueuedCount(items.length);
      });
    };
    refresh();
    const offChanged = onQueueChanged(refresh);
    const offSent = onSubmissionSent(() => {
      setJustSent(true);
      setTimeout(() => setJustSent(false), 2500);
    });
    return () => {
      cancelled = true;
      offChanged();
      offSent();
    };
  }, []);

  if (online && queuedCount === 0 && !justSent) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg-panel)] px-3.5 py-2 text-xs shadow-lg"
    >
      {!online ? (
        <>
          <CloudOff size={13} className="text-[var(--warn)]" aria-hidden />
          <span>{dict.offline.youAreOffline}</span>
        </>
      ) : justSent && queuedCount === 0 ? (
        <>
          <RefreshCw size={13} className="text-[var(--accent)]" aria-hidden />
          <span>{dict.offline.submissionSent}</span>
        </>
      ) : null}
      {queuedCount > 0 ? (
        <span className="rounded-full bg-[var(--accent-surface)] px-2 py-0.5 font-medium text-[var(--accent)]">
          {plural(
            queuedCount,
            dict.offline.submissionQueuedOne,
            t(dict.offline.submissionQueuedOther, { count: queuedCount })
          )}
        </span>
      ) : null}
    </div>
  );
}
