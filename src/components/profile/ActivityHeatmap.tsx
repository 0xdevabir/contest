"use client";

type Day = { date: string; count: number };

export function ActivityHeatmap({ days }: { days: Day[] }) {
  const max = Math.max(...days.map((d) => d.count), 1);
  // 17 weeks × 7 days laid out as columns (GitHub-style).
  const weeks: Day[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  function level(count: number) {
    if (count === 0) return "bg-[var(--line-soft)]";
    const r = count / max;
    if (r < 0.25) return "bg-[var(--accent)]/25";
    if (r < 0.5) return "bg-[var(--accent)]/45";
    if (r < 0.75) return "bg-[var(--accent)]/70";
    return "bg-[var(--accent)]";
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-1" role="img" aria-label="Submission activity heatmap">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.count} submission${d.count === 1 ? "" : "s"}`}
                className={`h-2.5 w-2.5 rounded-[2px] sm:h-3 sm:w-3 ${level(d.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] text-[var(--muted-dim)]">
        <span>Less</span>
        <span className="h-2.5 w-2.5 rounded-[2px] bg-[var(--line-soft)]" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-[var(--accent)]/25" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-[var(--accent)]/45" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-[var(--accent)]/70" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-[var(--accent)]" />
        <span>More</span>
      </div>
    </div>
  );
}
