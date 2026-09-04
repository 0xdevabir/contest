import { describe, expect, it, beforeEach } from "vitest";
import { hasTestDb } from "../../tests/setup";

/**
 * Phase 13 Part 3 testing plan: exact title beats partial; Bangla query
 * returns Bangla titles; trigram catches a typo. Requires a real Postgres
 * connection (TEST_DATABASE_URL) since `Problem.searchVector` is a
 * GENERATED STORED tsvector column with a GIN + trigram index — skipped by
 * the existing integration-tier gate (tests/setup.ts) without one.
 */
describe.skipIf(!hasTestDb)("search", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let authorId: string;

  beforeEach(async () => {
    ({ prisma } = await import("@/lib/db"));
    const user = await prisma.user.create({
      data: {
        email: `search-author-${Date.now()}-${Math.random()}@example.test`,
        passwordHash: "x",
        name: "Search Author",
        role: "TEACHER",
      },
    });
    authorId = user.id;
  });

  async function makeProblem(opts: { title: string; slug: string }) {
    return prisma.problem.create({
      data: {
        title: opts.title,
        slug: opts.slug,
        status: "PUBLISHED",
        visibility: "PUBLIC",
        authorId,
        difficulty: "EASY",
      },
    });
  }

  it("ranks an exact title match above a longer partial match", async () => {
    const { searchProblems } = await import("@/lib/search");
    await makeProblem({ title: "Binary Search", slug: `binary-search-${Date.now()}` });
    await makeProblem({ title: "Binary Search Tree Traversal Challenge", slug: `binary-search-tree-${Date.now()}` });

    const results = await searchProblems("Binary Search", 10);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].title).toBe("Binary Search");
  });

  it("returns Bangla-titled problems for a Bangla query", async () => {
    const { searchProblems } = await import("@/lib/search");
    await makeProblem({ title: "দ্বিমিক অনুসন্ধান", slug: `bangla-search-${Date.now()}` });
    await makeProblem({ title: "Unrelated English Title", slug: `unrelated-${Date.now()}` });

    const results = await searchProblems("দ্বিমিক অনুসন্ধান", 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.title === "দ্বিমিক অনুসন্ধান")).toBe(true);
  });

  it("trigram similarity catches a typo that misses full-text matching", async () => {
    const { searchProblems } = await import("@/lib/search");
    await makeProblem({ title: "Algorithm Basics", slug: `algorithm-basics-${Date.now()}` });

    const results = await searchProblems("Alogrithm Basics", 10);
    expect(results.some((r) => r.title === "Algorithm Basics")).toBe(true);
  });

  it("excludes unpublished/private problems from results", async () => {
    const { searchProblems } = await import("@/lib/search");
    await prisma.problem.create({
      data: {
        title: "Hidden Draft Problem",
        slug: `hidden-draft-${Date.now()}`,
        status: "DRAFT",
        visibility: "PRIVATE",
        authorId,
        difficulty: "EASY",
      },
    });

    const results = await searchProblems("Hidden Draft Problem", 10);
    expect(results.some((r) => r.title === "Hidden Draft Problem")).toBe(false);
  });
});
