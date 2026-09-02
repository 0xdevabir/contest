"use client";

/** D2 — explainable at-risk reasons, never a bare score. */
export function SignalChips({ signals }: { signals: { key: string; sentence: string }[] }) {
  if (signals.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {signals.map((s) => (
        <li
          key={s.key}
          className="rounded-full border border-[var(--warn-border)] bg-[var(--warn-surface)] px-2.5 py-1 text-[10px] text-[var(--text)]"
        >
          {s.sentence}
        </li>
      ))}
    </ul>
  );
}
