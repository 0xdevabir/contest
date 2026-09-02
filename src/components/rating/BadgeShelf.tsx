import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type BadgeAward = {
  code: string;
  name: string;
  description: string;
  icon: string;
  tier: string;
  earnedAt: string | Date;
};

const TIER_TEXT: Record<string, string> = {
  bronze: "text-[var(--diff-mh)]",
  silver: "text-[var(--muted)]",
  gold: "text-[var(--warn)]",
  special: "text-[var(--accent)]",
};

/** Badge.icon is stored kebab-case (lucide's own naming convention, e.g.
 * "check-circle", "rotate-ccw") — lucide-react exports the PascalCase form. */
function iconFor(name: string): LucideIcon {
  const pascal = name
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  return (Icons as unknown as Record<string, LucideIcon>)[pascal] ?? Icons.Award;
}

/** Grid with tooltips and earned dates — PHASE-09 frontend surfaces. */
export function BadgeShelf({ badges }: { badges: BadgeAward[] }) {
  if (badges.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No badges earned yet.</p>;
  }
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
      {badges.map((b) => {
        const Icon = iconFor(b.icon);
        return (
          <div
            key={b.code}
            title={`${b.name} — ${b.description}\nEarned ${new Date(b.earnedAt).toLocaleDateString()}`}
            className="panel flex aspect-square flex-col items-center justify-center gap-1.5 p-2 text-center"
          >
            <Icon size={20} className={TIER_TEXT[b.tier] ?? "text-[var(--muted)]"} aria-hidden />
            <span className="line-clamp-2 text-[9px] leading-tight text-[var(--muted)]">{b.name}</span>
          </div>
        );
      })}
    </div>
  );
}
