import { prisma } from "../../src/lib/db";

type SeedTag = {
  slug: string;
  name: string;
  category: "topic" | "technique" | "datastructure" | "meta";
  /// Tags that reveal the approach are hidden until the viewer has solved the problem.
  spoiler?: boolean;
};

/**
 * ~40-tag taxonomy for the C problem bank. "meta" tags (io, exam-style, ...)
 * are never spoilers — they describe the problem's shape, not its solution.
 * Everything else defaults to spoiler: true.
 */
export const TAGS: SeedTag[] = [
  // -- meta (never spoilers) --------------------------------------------
  { slug: "implementation", name: "Implementation", category: "meta", spoiler: false },
  { slug: "io-arithmetic", name: "I/O & Arithmetic", category: "meta", spoiler: false },
  { slug: "exam-style", name: "Exam Style", category: "meta", spoiler: false },
  { slug: "constructive", name: "Constructive", category: "meta", spoiler: false },
  { slug: "ad-hoc", name: "Ad Hoc", category: "meta", spoiler: false },

  // -- topic --------------------------------------------------------------
  { slug: "math", name: "Math", category: "topic" },
  { slug: "number-theory", name: "Number Theory", category: "topic" },
  { slug: "combinatorics", name: "Combinatorics", category: "topic" },
  { slug: "geometry", name: "Geometry", category: "topic" },
  { slug: "strings", name: "Strings", category: "topic" },
  { slug: "arrays", name: "Arrays", category: "topic" },
  { slug: "sorting", name: "Sorting", category: "topic" },
  { slug: "searching", name: "Searching", category: "topic" },
  { slug: "recursion", name: "Recursion", category: "topic" },
  { slug: "dynamic-programming", name: "Dynamic Programming", category: "topic" },
  { slug: "greedy", name: "Greedy", category: "topic" },
  { slug: "graphs", name: "Graphs", category: "topic" },
  { slug: "trees", name: "Trees", category: "topic" },
  { slug: "bit-manipulation", name: "Bit Manipulation", category: "topic" },
  { slug: "simulation", name: "Simulation", category: "topic" },
  { slug: "big-integers", name: "Big Integers", category: "topic" },
  { slug: "brute-force", name: "Brute Force", category: "topic" },
  { slug: "conditionals", name: "Conditionals", category: "topic" },
  { slug: "loops", name: "Loops", category: "topic" },
  { slug: "functions", name: "Functions", category: "topic" },
  { slug: "pointers", name: "Pointers", category: "topic" },

  // -- technique ------------------------------------------------------------
  { slug: "two-pointers", name: "Two Pointers", category: "technique" },
  { slug: "sliding-window", name: "Sliding Window", category: "technique" },
  { slug: "binary-search", name: "Binary Search", category: "technique" },
  { slug: "prefix-sums", name: "Prefix Sums", category: "technique" },
  { slug: "backtracking", name: "Backtracking", category: "technique" },
  { slug: "bfs-dfs", name: "BFS/DFS", category: "technique" },
  { slug: "divide-and-conquer", name: "Divide and Conquer", category: "technique" },
  { slug: "memoization", name: "Memoization", category: "technique" },
  { slug: "hashing", name: "Hashing", category: "technique" },
  { slug: "shortest-path", name: "Shortest Path", category: "technique" },

  // -- datastructure --------------------------------------------------------
  { slug: "linked-list", name: "Linked List", category: "datastructure" },
  { slug: "stack", name: "Stack", category: "datastructure" },
  { slug: "queue", name: "Queue", category: "datastructure" },
  { slug: "matrix", name: "Matrix", category: "datastructure" },
  { slug: "hash-table", name: "Hash Table", category: "datastructure" },
  { slug: "heap", name: "Heap", category: "datastructure" },
];

/** Maps a legacy bank problem's `setTitle` (and `topic`, when present) to
 * taxonomy slugs. Machine-derived — imported with weight: 1 so a human can
 * override without fighting the importer on re-runs. */
const SET_TITLE_MAP: { match: RegExp; tags: string[] }[] = [
  { match: /I\/O|Arithmetic/i, tags: ["io-arithmetic", "implementation"] },
  { match: /Conditional|String Basics/i, tags: ["conditionals", "strings"] },
  { match: /Array.*Frequency|Min\/Max|Search/i, tags: ["arrays", "searching"] },
  { match: /Loop/i, tags: ["loops"] },
  { match: /Function/i, tags: ["functions"] },
  { match: /Pointer/i, tags: ["pointers"] },
  { match: /Recursion/i, tags: ["recursion"] },
  { match: /Sort/i, tags: ["sorting", "arrays"] },
  { match: /String/i, tags: ["strings"] },
  { match: /Matrix|2D Array/i, tags: ["matrix", "arrays"] },
  { match: /Structure|Struct/i, tags: ["implementation"] },
  { match: /File/i, tags: ["implementation"] },
  { match: /Number Theory|Prime|Divisor|GCD|LCM/i, tags: ["number-theory", "math"] },
  { match: /Dynamic Programming|DP/i, tags: ["dynamic-programming"] },
  { match: /Greedy/i, tags: ["greedy"] },
  { match: /Graph/i, tags: ["graphs", "bfs-dfs"] },
  { match: /Tree/i, tags: ["trees"] },
  { match: /Bit/i, tags: ["bit-manipulation"] },
  { match: /Geometry/i, tags: ["geometry", "math"] },
  { match: /Combinat/i, tags: ["combinatorics", "math"] },
  { match: /Big Integer|Arbitrary Precision/i, tags: ["big-integers"] },
  { match: /Simulation/i, tags: ["simulation"] },
  { match: /Search/i, tags: ["searching", "binary-search"] },
  { match: /Stack/i, tags: ["stack"] },
  { match: /Queue/i, tags: ["queue"] },
  { match: /Linked List/i, tags: ["linked-list"] },
  { match: /Hash/i, tags: ["hashing", "hash-table"] },
];

export function deriveTagSlugsFor(setTitle: string, topic?: string, extreme?: boolean): string[] {
  const slugs = new Set<string>();
  const text = `${setTitle} ${topic ?? ""}`;
  for (const rule of SET_TITLE_MAP) {
    if (rule.match.test(text)) rule.tags.forEach((t) => slugs.add(t));
  }
  slugs.add("exam-style");
  if (extreme) slugs.add("constructive");
  if (slugs.size === 1) slugs.add("ad-hoc");
  return [...slugs];
}

/** Idempotent upsert keyed on slug — safe to re-run. */
export async function seedTags() {
  let created = 0;
  for (const tag of TAGS) {
    const existing = await prisma.tag.findUnique({ where: { slug: tag.slug } });
    if (existing) continue;
    await prisma.tag.create({
      data: {
        slug: tag.slug,
        name: tag.name,
        category: tag.category,
        spoiler: tag.spoiler ?? true,
      },
    });
    created++;
  }
  return { created, total: TAGS.length };
}
