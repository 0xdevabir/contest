import { prisma } from "./db";

/**
 * Phase 13 Part 7 — cost telemetry.
 *
 * This is a cost *model* dashboard, not a live spend tracker: the figures
 * below are the static table from `docs/ULTIMATE_PLAN.md` Appendix I
 * ("Cost model"), reproduced verbatim. No billing API credentials exist for
 * Vercel/Neon/Upstash/R2/Hetzner/Sentry/Resend in this environment (or
 * likely ever, given the target audience), so there is no live-spend source
 * to reconcile against — this estimates cost from the *scale tier* the
 * platform is actually operating at (user/submission counts from Postgres),
 * not from a provider invoice.
 */

export type ScaleTier = "500" | "5000" | "25000";

export type CostComponent = {
  key: string;
  label: string;
  /** Monthly USD at each scale tier, from Appendix I. */
  costByTier: Record<ScaleTier, number>;
  note?: string;
};

/**
 * Appendix I's table, component x 3 scale tiers (500 / 5,000 / 25,000
 * users). Costs are monthly, USD, assuming Bangladesh-friendly providers and
 * no enterprise tiers. Where Appendix I gives a range (Vercel at 25k, judge
 * workers with "+ burst"), the low end of the range is used here — a
 * dashboard estimate should not overstate cost, and Part 4's autoscaling is
 * exactly the mechanism that keeps the burst cost bounded.
 */
export const COST_MODEL: CostComponent[] = [
  {
    key: "vercel",
    label: "Vercel (web)",
    costByTier: { "500": 0, "5000": 20, "25000": 20 },
    note: "Hobby tier at 500 users; Pro from 5,000. Appendix I gives $20–60 at 25k — $20 (Pro floor) shown; usage-based overage not modeled.",
  },
  {
    key: "neon",
    label: "Neon Postgres",
    costByTier: { "500": 0, "5000": 19, "25000": 69 },
  },
  {
    key: "upstashRedis",
    label: "Upstash Redis",
    costByTier: { "500": 0, "5000": 10, "25000": 30 },
  },
  {
    key: "r2",
    label: "Cloudflare R2",
    costByTier: { "500": 0, "5000": 2, "25000": 8 },
  },
  {
    key: "judgeWorkers",
    label: "Judge workers (Hetzner CX32, 4 vCPU, $8 each)",
    costByTier: { "500": 8, "5000": 16, "25000": 40 },
    note: "$8 x 1 / $8 x 2 / $8 x 5. Appendix I notes '+ burst' at 25k — Part 4's queue-depth autoscaler is what keeps that bounded; burst cost is not modeled here since it depends on actual contest scheduling.",
  },
  {
    key: "sentry",
    label: "Sentry / logs",
    costByTier: { "500": 0, "5000": 0, "25000": 26 },
  },
  {
    key: "email",
    label: "Email (SMTP -> Resend)",
    costByTier: { "500": 0, "5000": 0, "25000": 20 },
  },
];

/** Sum of every component's cost at a given tier, matching Appendix I's totals ($8 / $67 / $210). */
export function totalMonthlyCost(tier: ScaleTier): number {
  return COST_MODEL.reduce((sum, c) => sum + c.costByTier[tier], 0);
}

/**
 * Picks the nearest scale tier at or above the current user count, so the
 * estimate never understates cost as the platform grows past a tier's
 * defining population before the next tier's row would technically apply.
 */
export function tierForUserCount(userCount: number): ScaleTier {
  if (userCount <= 500) return "500";
  if (userCount <= 5000) return "5000";
  return "25000";
}

export type CurrentScaleEstimate = {
  userCount: number;
  submissionCount: number;
  tier: ScaleTier;
  totalMonthlyCostUsd: number;
  /** totalMonthlyCostUsd / (submissionCount / 1000); null when there are no submissions yet. */
  costPerThousandSubmissionsUsd: number | null;
  components: CostComponent[];
};

/**
 * Estimates "current scale" from live Postgres counts, then maps that onto
 * the nearest Appendix I tier. This is the only part of this module that
 * touches real data — everything else is the static model table above.
 */
export async function estimateCurrentScale(): Promise<CurrentScaleEstimate> {
  const [userCount, submissionCount] = await Promise.all([
    prisma.user.count(),
    prisma.submission.count(),
  ]);

  const tier = tierForUserCount(userCount);
  const totalMonthlyCostUsd = totalMonthlyCost(tier);
  const costPerThousandSubmissionsUsd =
    submissionCount > 0 ? totalMonthlyCostUsd / (submissionCount / 1000) : null;

  return {
    userCount,
    submissionCount,
    tier,
    totalMonthlyCostUsd,
    costPerThousandSubmissionsUsd,
    components: COST_MODEL,
  };
}
