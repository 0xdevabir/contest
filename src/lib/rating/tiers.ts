/** D2 — Codeforces-family tiers, adapted labels. Boundaries are inclusive of
 * the lower bound; `tierFor` picks the highest tier whose min the rating
 * clears. Colours live in src/lib/theme.ts's per-theme `tier` ramp — this
 * module only knows the CSS variable name (`--tier-<key>`), never a raw hex,
 * so cyan-on-white / grey-on-black contrast issues are handled per theme. */
export type Tier = {
  key: string;
  label: string;
  min: number;
};

export const TIERS: Tier[] = [
  { key: "newbie", label: "Newbie", min: 0 },
  { key: "pupil", label: "Pupil", min: 1200 },
  { key: "specialist", label: "Specialist", min: 1400 },
  { key: "expert", label: "Expert", min: 1600 },
  { key: "candidate-master", label: "Candidate Master", min: 1900 },
  { key: "master", label: "Master", min: 2100 },
  { key: "international-master", label: "International Master", min: 2300 },
  { key: "grandmaster", label: "Grandmaster", min: 2400 },
];

export function tierColorVar(tier: Tier): string {
  return `var(--tier-${tier.key})`;
}

export function tierFor(rating: number): Tier {
  let match = TIERS[0];
  for (const tier of TIERS) {
    if (rating >= tier.min) match = tier;
  }
  return match;
}
