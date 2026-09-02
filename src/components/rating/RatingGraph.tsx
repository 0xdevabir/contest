import { TIERS, tierColorVar, tierFor } from "@/lib/rating/tiers";

export type RatingHistoryPoint = {
  contestTitle: string;
  displayedAfter: number;
  createdAt: string | Date;
};

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 24, left: 40 };

/**
 * Dependency-free inline SVG line chart with tier bands — PHASE-09's
 * frontend surfaces call for exactly this, no charting library. Points are
 * plotted in contest order (not real time), same convention as Codeforces'
 * rating graph, so events stay evenly spaced regardless of gaps between
 * contests.
 */
export function RatingGraph({ history }: { history: RatingHistoryPoint[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No rated contests yet.</p>;
  }

  const values = history.map((h) => h.displayedAfter);
  const min = Math.min(...values, TIERS[0].min);
  const max = Math.max(...values, TIERS[TIERS.length - 1].min + 200);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (history.length === 1 ? innerW / 2 : (i / (history.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH;

  const path = history.map((h, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(h.displayedAfter).toFixed(1)}`).join(" ");

  const bands = TIERS.filter((t) => t.min >= min && t.min <= max);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Rating history over rated contests">
      {bands.map((t) => (
        <line
          key={t.key}
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={y(t.min)}
          y2={y(t.min)}
          stroke={tierColorVar(t)}
          strokeOpacity={0.25}
          strokeDasharray="4 4"
        />
      ))}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
      {history.map((h, i) => (
        <circle key={i} cx={x(i)} cy={y(h.displayedAfter)} r={3.5} fill={tierColorVar(tierFor(h.displayedAfter))}>
          <title>
            {h.contestTitle}: {h.displayedAfter} ({new Date(h.createdAt).toLocaleDateString()})
          </title>
        </circle>
      ))}
    </svg>
  );
}
