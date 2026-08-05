"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

type Piece = {
  left: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  color: string;
  width: number;
  height: number;
  round: boolean;
};

function buildConfetti(count: number, colors: string[]): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const round = i % 5 === 0;
    return {
      left: Math.random() * 100,
      delay: Math.random() * 0.55,
      duration: 2 + Math.random() * 1.6,
      drift: (Math.random() - 0.5) * 240,
      spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
      color: colors[i % colors.length],
      width: round ? 6 : 5 + Math.random() * 4,
      height: round ? 6 : 9 + Math.random() * 6,
      round,
    };
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  problemTitle: string;
  passed: number;
  total: number;
  timeMs?: number | null;
  nextHref?: string | null;
};

export function AcceptedCelebration({
  open,
  onClose,
  problemTitle,
  passed,
  total,
  timeMs,
  nextHref,
}: Props) {
  const { theme } = useTheme();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const confetti = useMemo(
    () => (open ? buildConfetti(40, theme.confetti) : []),
    [open, theme]
  );

  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-[70] flex items-center justify-center bg-[var(--overlay)] px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="accepted-title"
      onClick={onClose}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {confetti.map((p, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={
              {
                left: `${p.left}%`,
                width: p.width,
                height: p.height,
                background: p.color,
                borderRadius: p.round ? "50%" : 1,
                "--delay": `${p.delay}s`,
                "--dur": `${p.duration}s`,
                "--drift": `${p.drift}px`,
                "--spin": `${p.spin}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div
        ref={cardRef}
        tabIndex={-1}
        className="animate-card-pop panel relative w-full max-w-sm overflow-hidden p-6 text-center outline-none sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[var(--accent)]/20 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto flex h-16 w-16 items-center justify-center" aria-hidden>
          <span className="animate-seal-ring absolute inset-0 rounded-full border border-[var(--accent)]" />
          <span className="animate-seal-in flex h-16 w-16 items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent-surface)]">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
              <path
                d="M5 12.5 10 17.5 19 7.5"
                stroke="var(--accent)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-draw-check"
              />
            </svg>
          </span>
        </div>

        <p className="eyebrow mt-5 text-[var(--accent)]">
          <Sparkles size={11} className="mr-1 inline align-[-1px]" aria-hidden />
          Accepted
        </p>
        <h2 id="accepted-title" className="mt-2 font-display text-2xl font-bold">
          Solved it.
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          <span className="text-[var(--text)]">{problemTitle}</span> passed every test — including
          the hidden ones.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 border-y border-[var(--line-soft)] py-3.5 font-mono text-[11px]">
          <div>
            <p className="tnum text-lg font-semibold text-[var(--accent)]">
              {passed}/{total}
            </p>
            <p className="mt-0.5 text-[var(--muted-dim)] uppercase tracking-wide">Tests passed</p>
          </div>
          <div>
            <p className="tnum text-lg font-semibold">{timeMs != null ? `${timeMs} ms` : "—"}</p>
            <p className="mt-0.5 text-[var(--muted-dim)] uppercase tracking-wide">Slowest test</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            className="btn btn-ghost !py-2 !text-xs"
            onClick={onClose}
          >
            Stay here
          </button>
          {nextHref ? (
            <Link href={nextHref} className="btn btn-primary !py-2 !text-xs" onClick={onClose}>
              Next problem
              <ArrowRight size={14} aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

