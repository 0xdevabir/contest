import { tierFor, tierColorVar } from "@/lib/rating/tiers";

/**
 * Tier-coloured rating chip — PHASE-09 D2/frontend surfaces: "used everywhere
 * a name appears". Colour always comes from the theme's `--tier-*` token
 * (src/lib/theme.ts), never a literal hex, so it stays readable in every
 * theme including light/high-contrast ones.
 */
export function RatingBadge({
  rating,
  size = "sm",
  showLabel = false,
}: {
  rating: number;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const tier = tierFor(rating);
  const color = tierColorVar(tier);
  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-semibold ${textSize} tnum`}
      style={{ color }}
      title={`${tier.label} · ${rating}`}
    >
      <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: color }} />
      {rating}
      {showLabel ? <span className="font-sans font-normal opacity-80"> · {tier.label}</span> : null}
    </span>
  );
}
