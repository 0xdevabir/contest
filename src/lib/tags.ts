import { prisma } from "./db";

export type TagOption = {
  id: string;
  slug: string;
  name: string;
  category: string;
  spoiler: boolean;
};

export async function listTags(opts?: { q?: string; category?: string }): Promise<TagOption[]> {
  const rows = await prisma.tag.findMany({
    where: {
      category: opts?.category || undefined,
      ...(opts?.q
        ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { slug: { contains: opts.q, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return rows;
}

export type ProblemTagView = { slug: string; name: string; category: string; spoiler: boolean };

/**
 * Hides tags marked `spoiler: true` from anyone who hasn't solved the
 * problem yet — a "dynamic-programming" tag on an unsolved problem is a
 * giveaway of the intended approach. `hasSolved` is the caller's
 * responsibility (checked once per problem view, not per tag).
 */
export function gateSpoilerTags(
  tags: ProblemTagView[],
  hasSolved: boolean
): ProblemTagView[] {
  if (hasSolved) return tags;
  return tags.filter((t) => !t.spoiler);
}

export async function getProblemTags(problemId: string): Promise<ProblemTagView[]> {
  const rows = await prisma.problemTag.findMany({
    where: { problemId },
    include: { tag: true },
    orderBy: { weight: "desc" },
  });
  return rows.map((r) => ({
    slug: r.tag.slug,
    name: r.tag.name,
    category: r.tag.category,
    spoiler: r.tag.spoiler,
  }));
}
