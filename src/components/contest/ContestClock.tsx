"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContestPhase } from "@/lib/contest-dashboard";

/**
 * A clock anchored to the server's time.
 *
 * Contestants run with whatever their laptop clock says, and a machine that is
 * ten minutes fast would otherwise show the wrong time remaining. We keep the
 * offset measured at load and tick against that. The first render deliberately
 * uses the server value on both sides so hydration matches.
 */
export function useServerClock(serverNowMs: number) {
  const offsetRef = useRef<number | null>(null);
  if (offsetRef.current === null) offsetRef.current = serverNowMs - Date.now();
  const [now, setNow] = useState(serverNowMs);

  useEffect(() => {
    const offset = offsetRef.current ?? 0;
    const tick = () => setNow(Date.now() + offset);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return now;
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type Props = {
  phase: ContestPhase;
  startsAtMs: number | null;
  endsAtMs: number | null;
  serverNowMs: number;
  freezeAtMs: number | null;
};

export function ContestCountdown({
  phase,
  startsAtMs,
  endsAtMs,
  serverNowMs,
  freezeAtMs,
}: Props) {
  const router = useRouter();
  const now = useServerClock(serverNowMs);
  const rolledOver = useRef(false);

  const target = phase === "BEFORE" ? startsAtMs : endsAtMs;
  const remaining = target ? target - now : null;

  // The moment the clock runs out the page is stale — the contest just opened or
  // closed — so pull fresh state instead of leaving a frozen 00:00:00 on screen.
  useEffect(() => {
    if (phase === "ENDED" || remaining === null || rolledOver.current) return;
    if (remaining > 0) return;
    rolledOver.current = true;
    router.refresh();
  }, [phase, remaining, router]);

  const elapsedPct = (() => {
    if (!startsAtMs || !endsAtMs || endsAtMs <= startsAtMs) return phase === "ENDED" ? 100 : 0;
    return Math.min(100, Math.max(0, ((now - startsAtMs) / (endsAtMs - startsAtMs)) * 100));
  })();

  const freezePct = (() => {
    if (!startsAtMs || !endsAtMs || !freezeAtMs || endsAtMs <= startsAtMs) return null;
    return Math.min(100, Math.max(0, ((freezeAtMs - startsAtMs) / (endsAtMs - startsAtMs)) * 100));
  })();

  const label =
    phase === "BEFORE" ? "Starts in" : phase === "RUNNING" ? "Time remaining" : "Finished";
  // Under five minutes the clock turns urgent — the single most useful signal on
  // the page at that point.
  const urgent = phase === "RUNNING" && remaining !== null && remaining <= 5 * 60_000;

  return (
    <div className="w-full sm:w-auto sm:min-w-[15rem]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
          {label}
        </span>
        {phase === "RUNNING" && (
          <span className="font-mono text-[10px] text-[var(--muted)]">
            {Math.round(elapsedPct)}% elapsed
          </span>
        )}
      </div>
      <div
        className={`font-mono text-2xl font-bold tabular-nums sm:text-[1.75rem] ${
          urgent ? "text-[var(--danger)]" : "text-[var(--text)]"
        }`}
        aria-live="off"
      >
        {phase === "ENDED" || remaining === null ? "00:00:00" : formatClock(remaining)}
      </div>
      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--sunken)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-1000 ease-linear"
          style={{ width: `${elapsedPct}%` }}
        />
        {freezePct !== null && (
          <span
            className="absolute top-0 h-full w-px bg-[var(--warn)]"
            style={{ left: `${freezePct}%` }}
            title="Scoreboard freeze"
          />
        )}
      </div>
    </div>
  );
}
