import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toResponse } from "@/lib/errors";
import { prismaDifficultyToLabel, labelToPrismaDifficulty } from "@/lib/difficulty";
import type { Difficulty } from "@/lib/types";

export const runtime = "nodejs";

const PAGE_SIZE = 40;

/** Public archive listing (Phase 2's rebuilt /problems page): tag chips,
 * difficulty filter, solved/unsolved (signed-in only), search, cursor
 * pagination. Never touches hidden test content. */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tag = searchParams.get("tag") ?? undefined;
    const difficultyParam = searchParams.get("difficulty") ?? undefined;
    const status = searchParams.get("status") ?? undefined; // "solved" | "unsolved"
    const q = searchParams.get("q")?.trim() ?? "";
    const cursor = searchParams.get("cursor") ?? undefined;

    let session = null;
    try {
      session = await getSession();
    } catch {
      session = null;
    }

    // Filtered at the query level (not post-filtered after paging) so
    // pagination stays correct — a post-filter would silently shrink pages
    // below PAGE_SIZE and desync `nextCursor` from what was actually shown.
    let solvedFilter: Prisma.ProblemWhereInput = {};
    if (session && (status === "solved" || status === "unsolved")) {
      const solved = await prisma.solvedProblem.findMany({
        where: { userId: session.id },
        select: { problemId: true },
      });
      const slugs = solved.map((s) => s.problemId);
      solvedFilter = { slug: status === "solved" ? { in: slugs } : { notIn: slugs } };
    }

    const where: Prisma.ProblemWhereInput = {
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ...(difficultyParam ? { difficulty: labelToPrismaDifficulty(difficultyParam as Difficulty) } : {}),
      ...(tag ? { tags: { some: { tag: { slug: tag } } } } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      ...solvedFilter,
    };

    const rows = await prisma.problem.findMany({
      where,
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        difficulty: true,
        legacySet: true,
        legacyQuestion: true,
        tags: { select: { tag: { select: { slug: true, name: true, spoiler: true } } }, orderBy: { weight: "desc" } },
        stats: { select: { attempts: true, accepted: true } },
      },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);

    let solvedSlugs: Set<string> | null = null;
    if (session) {
      const solved = await prisma.solvedProblem.findMany({
        where: { userId: session.id, problemId: { in: page.map((p) => p.slug) } },
        select: { problemId: true },
      });
      solvedSlugs = new Set(solved.map((s) => s.problemId));
    }

    const items = page.map((p) => ({
      id: p.slug,
      title: p.title,
      difficulty: prismaDifficultyToLabel(p.difficulty),
      set: p.legacySet,
      question: p.legacyQuestion,
      tags: p.tags.map((t) => t.tag).filter((t) => !t.spoiler),
      attempts: p.stats?.attempts ?? 0,
      accepted: p.stats?.accepted ?? 0,
      solved: solvedSlugs ? solvedSlugs.has(p.slug) : null,
    }));

    return NextResponse.json({
      ok: true,
      items,
      nextCursor: hasMore ? page[page.length - 1]?.id : null,
    });
  } catch (err) {
    return toResponse(err);
  }
}
