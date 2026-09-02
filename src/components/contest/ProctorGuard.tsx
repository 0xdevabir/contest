"use client";

import { useEffect, useRef } from "react";
import { ShieldAlert } from "lucide-react";

type ProctorEventType =
  | "blur"
  | "focus"
  | "hidden"
  | "visible"
  | "paste"
  | "copy"
  | "fullscreen-exit";

type ProctorEvent = {
  type: ProctorEventType;
  at: string;
  meta: { durationMs?: number; length?: number };
};

const FLUSH_INTERVAL_MS = 15_000;

/**
 * D4 proctoring-lite: visible banner + best-effort telemetry, never a lockdown.
 * Mounted only when the contest's `strictMode` rule is true. Never reads or
 * sends event content — only bounded meta (durationMs/length), matching
 * src/lib/integrity/proctor.ts's metaSchema.
 */
export function ProctorGuard({ contestId }: { contestId: string }) {
  const queue = useRef<ProctorEvent[]>([]);
  const awaySince = useRef<number | null>(null);

  useEffect(() => {
    const endpoint = `/api/contests/${contestId}/proctor`;

    function push(type: ProctorEventType, meta: ProctorEvent["meta"] = {}) {
      queue.current.push({ type, at: new Date().toISOString(), meta });
    }

    function flush(useBeacon = false) {
      if (!queue.current.length) return;
      const events = queue.current;
      queue.current = [];
      const body = JSON.stringify({ events });
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
        return;
      }
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        // Best-effort — a dropped batch is not worth surfacing to the student.
      });
    }

    function markAway() {
      if (awaySince.current == null) awaySince.current = Date.now();
    }

    function markBack(type: "focus" | "visible") {
      const durationMs = awaySince.current != null ? Date.now() - awaySince.current : undefined;
      awaySince.current = null;
      push(type, durationMs !== undefined ? { durationMs } : {});
    }

    function onBlur() {
      markAway();
      push("blur");
    }
    function onFocus() {
      markBack("focus");
    }
    function onVisibilityChange() {
      if (document.hidden) {
        markAway();
        push("hidden");
      } else {
        markBack("visible");
      }
    }
    function onPaste(e: ClipboardEvent) {
      const length = e.clipboardData?.getData("text")?.length ?? 0;
      push("paste", { length });
    }
    function onCopy() {
      push("copy");
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement) push("fullscreen-exit");
    }

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("paste", onPaste);
    document.addEventListener("copy", onCopy);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    const interval = setInterval(() => flush(false), FLUSH_INTERVAL_MS);
    const onBeforeUnload = () => flush(true);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearInterval(interval);
      flush(true);
    };
  }, [contestId]);

  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--warn-border)] bg-[var(--warn-surface)] px-3 py-2 text-[11px] text-[var(--warn)]"
    >
      <ShieldAlert size={14} aria-hidden="true" className="shrink-0" />
      <span>
        Strict mode is on for this contest — tab switches, window focus, and clipboard activity are
        logged for academic-integrity review.
      </span>
    </div>
  );
}
