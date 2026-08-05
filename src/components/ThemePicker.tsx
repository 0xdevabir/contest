"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Palette } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { THEMES, THEME_LIST, type Theme, type ThemeMode } from "@/lib/theme";

/** Three-stop preview of a theme, drawn from its own tokens. */
function Swatch({ theme, size = 26 }: { theme: Theme; size?: number }) {
  const p = theme.palette;
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-md border"
      style={{ borderColor: p.line, width: size, height: size }}
      aria-hidden
    >
      <span style={{ background: p.bg, width: "50%" }} />
      <span style={{ background: p.bgPanel, width: "25%" }} />
      <span style={{ background: p.accent, width: "25%" }} />
    </span>
  );
}

function SystemSwatch({ size = 26 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] text-[var(--muted)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Monitor size={13} />
    </span>
  );
}

type Option = { mode: ThemeMode; label: string; description: string };

const OPTIONS: Option[] = [
  { mode: "system", label: "System", description: "Follow the operating system." },
  ...THEME_LIST.map((t) => ({
    mode: t.id as ThemeMode,
    label: t.label,
    description: t.description,
  })),
];

/** Full picker used on the settings page — applies instantly, no save needed. */
export function ThemePicker() {
  const { mode, setTheme } = useTheme();

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {OPTIONS.map((opt) => {
        const active = mode === opt.mode;
        const theme = opt.mode === "system" ? null : THEMES[opt.mode];
        return (
          <button
            key={opt.mode}
            type="button"
            onClick={() => setTheme(opt.mode)}
            aria-pressed={active}
            className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
              active
                ? "border-[var(--accent-border)] bg-[var(--accent-surface)]"
                : "border-[var(--line)] hover:border-[var(--line-strong)] hover:bg-[var(--hover)]"
            }`}
          >
            {theme ? <Swatch theme={theme} size={32} /> : <SystemSwatch size={32} />}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                {opt.label}
                {active ? <Check size={13} className="text-[var(--accent)]" /> : null}
              </span>
              <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                {opt.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Compact dropdown for the site header. */
export function ThemeMenu({ className = "" }: { className?: string }) {
  const { mode, theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${mode === "system" ? "System" : theme.label}`}
        title={`Theme: ${mode === "system" ? "System" : theme.label}`}
        className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-2 py-1.5 text-[var(--muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]"
      >
        <Palette size={15} aria-hidden />
        <Swatch theme={theme} size={16} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-1 shadow-2xl"
        >
          {OPTIONS.map((opt) => {
            const active = mode === opt.mode;
            const t = opt.mode === "system" ? null : THEMES[opt.mode];
            return (
              <button
                key={opt.mode}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(opt.mode);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-[var(--accent-surface)] text-[var(--accent)]"
                    : "text-[var(--text)] hover:bg-[var(--hover)]"
                }`}
              >
                {t ? <Swatch theme={t} size={20} /> : <SystemSwatch size={20} />}
                <span className="flex-1">{opt.label}</span>
                {active ? <Check size={14} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
