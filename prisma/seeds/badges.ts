import { prisma } from "../../src/lib/db";
import type { BadgeRule } from "../../src/lib/badges";

type SeedBadge = {
  code: string;
  name: string;
  description: string;
  icon: string;
  tier: "bronze" | "silver" | "gold" | "special";
  rule: BadgeRule;
  hidden?: boolean;
};

/**
 * ~30 badges (PHASE-09 "Badge engine" — "seed ~30 badges; include a few
 * hidden ones"). Adding one more is a row here, never new code — the engine
 * in src/lib/badges.ts only knows how to evaluate the `rule` shapes.
 */
export const BADGES: SeedBadge[] = [
  // -- solve_count ----------------------------------------------------------
  { code: "solve-1", name: "First Blood", description: "Solved your first problem.", icon: "flag", tier: "bronze", rule: { type: "solve_count", threshold: 1 } },
  { code: "solve-10", name: "Getting Started", description: "Solved 10 problems.", icon: "check-circle", tier: "bronze", rule: { type: "solve_count", threshold: 10 } },
  { code: "solve-50", name: "Half-Century", description: "Solved 50 problems.", icon: "trophy", tier: "silver", rule: { type: "solve_count", threshold: 50 } },
  { code: "solve-100", name: "Centurion", description: "Solved 100 problems.", icon: "medal", tier: "silver", rule: { type: "solve_count", threshold: 100 } },
  { code: "solve-250", name: "Grinder", description: "Solved 250 problems.", icon: "hammer", tier: "gold", rule: { type: "solve_count", threshold: 250 } },
  { code: "solve-500", name: "Half a Thousand", description: "Solved 500 problems.", icon: "award", tier: "gold", rule: { type: "solve_count", threshold: 500 } },
  { code: "solve-1000", name: "The Thousand", description: "Solved 1000 problems.", icon: "crown", tier: "special", rule: { type: "solve_count", threshold: 1000 } },

  // -- streak -----------------------------------------------------------
  { code: "streak-7", name: "One Week Strong", description: "A 7-day solving streak.", icon: "flame", tier: "bronze", rule: { type: "streak", days: 7 } },
  { code: "streak-30", name: "Monthly Habit", description: "A 30-day solving streak.", icon: "flame", tier: "silver", rule: { type: "streak", days: 30 } },
  { code: "streak-100", name: "Unstoppable", description: "A 100-day solving streak.", icon: "flame", tier: "gold", rule: { type: "streak", days: 100 } },
  { code: "streak-365", name: "Full Year", description: "A 365-day solving streak.", icon: "flame", tier: "special", rule: { type: "streak", days: 365 } },

  // -- contest_rank -------------------------------------------------------
  { code: "contest-podium", name: "On the Podium", description: "Finished top 3 in a rated contest.", icon: "trophy", tier: "gold", rule: { type: "contest_rank", max: 3, minField: 20 } },
  { code: "contest-top-10-percent", name: "Top Tenth", description: "Finished in the top 10% of a rated contest.", icon: "star", tier: "silver", rule: { type: "contest_rank", max: 10, minField: 100 } },
  { code: "contest-top-half", name: "Above the Line", description: "Finished in the top half of a rated contest.", icon: "trending-up", tier: "bronze", rule: { type: "contest_rank", max: 25, minField: 50 } },

  // -- rating_tier ----------------------------------------------------------
  { code: "cf-pupil", name: "Pupil", description: "Reached Pupil rating.", icon: "circle", tier: "bronze", rule: { type: "rating_tier", tier: "pupil" } },
  { code: "cf-specialist", name: "Specialist", description: "Reached Specialist rating.", icon: "circle", tier: "bronze", rule: { type: "rating_tier", tier: "specialist" } },
  { code: "cf-expert", name: "Expert", description: "Reached Expert rating.", icon: "circle", tier: "silver", rule: { type: "rating_tier", tier: "expert" } },
  { code: "cf-candidate-master", name: "Candidate Master", description: "Reached Candidate Master rating.", icon: "circle", tier: "silver", rule: { type: "rating_tier", tier: "candidate-master" } },
  { code: "cf-master", name: "Master", description: "Reached Master rating.", icon: "circle", tier: "gold", rule: { type: "rating_tier", tier: "master" } },
  { code: "cf-grandmaster", name: "Grandmaster", description: "Reached Grandmaster rating.", icon: "circle", tier: "special", rule: { type: "rating_tier", tier: "grandmaster" } },

  // -- tag_mastery --------------------------------------------------------
  { code: "tag-dp-25", name: "Dynamic Programmer", description: "Solved 25 dynamic programming problems.", icon: "git-branch", tier: "silver", rule: { type: "tag_mastery", tagSlug: "dynamic-programming", solved: 25 } },
  { code: "tag-graphs-25", name: "Graph Theorist", description: "Solved 25 graph problems.", icon: "share-2", tier: "silver", rule: { type: "tag_mastery", tagSlug: "graphs", solved: 25 } },
  { code: "tag-strings-25", name: "String Wrangler", description: "Solved 25 string problems.", icon: "type", tier: "silver", rule: { type: "tag_mastery", tagSlug: "strings", solved: 25 } },
  { code: "tag-math-25", name: "Mathematician", description: "Solved 25 math problems.", icon: "sigma", tier: "silver", rule: { type: "tag_mastery", tagSlug: "math", solved: 25 } },
  { code: "tag-greedy-25", name: "Greedy Solver", description: "Solved 25 greedy problems.", icon: "target", tier: "silver", rule: { type: "tag_mastery", tagSlug: "greedy", solved: 25 } },

  // -- first_ac_of_problem --------------------------------------------------
  { code: "first-ac", name: "Trailblazer", description: "First to solve a problem.", icon: "compass", tier: "gold", rule: { type: "first_ac_of_problem" } },

  // -- night_owl / comeback (hidden — "discovering an unexpected badge") ----
  { code: "night-owl", name: "Night Owl", description: "Solved 10 problems between 2am and 5am.", icon: "moon", tier: "special", rule: { type: "night_owl", hourRange: [2, 5], count: 10 }, hidden: true },
  { code: "comeback-kid", name: "Comeback Kid", description: "Solved a problem after 5+ failed attempts.", icon: "rotate-ccw", tier: "special", rule: { type: "comeback", attempts: 5 }, hidden: true },
  { code: "comeback-kid-10", name: "Never Give Up", description: "Solved a problem after 10+ failed attempts.", icon: "rotate-ccw", tier: "special", rule: { type: "comeback", attempts: 10 }, hidden: true },

  // -- season badges (awarded by src/lib/seasons.ts, not the rule engine) --
  { code: "season-champion", name: "Season Champion", description: "Finished #1 in a season.", icon: "crown", tier: "special", rule: { type: "contest_rank", max: 0, minField: 0 } },
  { code: "season-top-3", name: "Season Podium", description: "Finished top 3 in a season.", icon: "trophy", tier: "gold", rule: { type: "contest_rank", max: 0, minField: 0 } },
  { code: "season-top-10", name: "Season Top 10", description: "Finished top 10 in a season.", icon: "medal", tier: "silver", rule: { type: "contest_rank", max: 0, minField: 0 } },
  { code: "season-most-improved", name: "Most Improved", description: "The largest rating gain this season.", icon: "trending-up", tier: "gold", rule: { type: "contest_rank", max: 0, minField: 0 } },
  { code: "season-most-active", name: "Most Active", description: "Rated in the most contests this season.", icon: "activity", tier: "silver", rule: { type: "contest_rank", max: 0, minField: 0 } },
];

/** Idempotent upsert keyed on code — safe to re-run. */
export async function seedBadges() {
  let created = 0;
  for (const badge of BADGES) {
    const existing = await prisma.badge.findUnique({ where: { code: badge.code } });
    if (existing) continue;
    await prisma.badge.create({
      data: {
        code: badge.code,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        tier: badge.tier,
        rule: badge.rule,
        hidden: badge.hidden ?? false,
      },
    });
    created++;
  }
  return { created, total: BADGES.length };
}
