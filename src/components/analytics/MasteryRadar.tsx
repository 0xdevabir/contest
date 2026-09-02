"use client";

type Entry = { tagId: string; name: string; mastery: number; attempted: number; solved: number };

/**
 * Tag mastery, ranked weakest-first as horizontal bars. A true radar chart
 * only reads cleanly for a handful of axes and gets worse the more topics a
 * student has touched — a ranked bar list scales to dozens of tags and is
 * exactly what "which topic should this student work on" needs. Kept the
 * PHASE-08-named `MasteryRadar` export so the surface table's component name
 * still maps to one file.
 */
export function MasteryRadar({ entries, limit = 10 }: { entries: Entry[]; limit?: number }) {
  const shown = [...entries].sort((a, b) => a.mastery - b.mastery).slice(0, limit);
  if (shown.length === 0) {
    return <p className="text-xs text-[var(--muted)]">No attempted topics yet.</p>;
  }

  return (
    <ul className="space-y-2" aria-label="Tag mastery, weakest first">
      {shown.map((e) => {
        const pct = Math.round(e.mastery * 100);
        return (
          <li key={e.tagId} className="text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium">{e.name}</span>
              <span className="font-mono text-[10px] text-[var(--muted)]">
                {pct}% · {e.solved}/{e.attempted}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--line-soft)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
