import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiKey, v1Data, v1Error, encodeCursor, parsePageParams } from "@/lib/v1/http";
import { assertCan } from "@/lib/authz";
import { ValidationError } from "@/lib/errors";
import { createProblem } from "@/lib/problem-authoring";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case"),
  difficulty: z.enum(["VERY EASY", "EASY", "MEDIUM", "MEDIUM-HARD", "HARD", "VERY HARD", "EXTREME"]),
  visibility: z.enum(["PUBLIC", "INSTITUTION", "PRIVATE"]).default("PRIVATE"),
  statement_md: z.string().min(1),
  time_limit_ms: z.number().int().positive().max(20_000).optional(),
  memory_limit_mb: z.number().int().positive().max(1024).optional(),
});

/** GET /api/v1/problems — D1's cursor-paginated list, filterable by tag,
 * difficulty and author; visibility-scoped to what the key owner can see. */
export async function GET(req: Request) {
  try {
    const key = await requireApiKey(req, "problems:read");
    const url = new URL(req.url);
    const { limit, cursor } = parsePageParams(url);
    const tag = url.searchParams.get("tag");
    const difficulty = url.searchParams.get("difficulty");
    const authorId = url.searchParams.get("author");

    const where: Prisma.ProblemWhereInput = {
      status: "PUBLISHED",
      OR: [
        { visibility: "PUBLIC" },
        { visibility: "INSTITUTION", institutionId: key.owner.institutionId ?? "__none__" },
        { visibility: "PRIVATE", authorId: key.owner.id },
      ],
    };
    if (difficulty) where.difficulty = difficulty as Prisma.EnumDifficultyFilter["equals"];
    if (authorId) where.authorId = authorId;
    if (tag) where.tags = { some: { tag: { slug: tag } } };

    const rows = await prisma.problem.findMany({
      where,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
      orderBy: { id: "asc" },
      select: { id: true, slug: true, title: true, difficulty: true, visibility: true, authorId: true, createdAt: true },
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return v1Data(
      page.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        visibility: p.visibility,
        author_id: p.authorId,
        created_at: p.createdAt.toISOString(),
      })),
      { nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null, hasMore }
    );
  } catch (err) {
    return v1Error(err);
  }
}

/** POST /api/v1/problems — funnels into the same authoring API the teacher
 * UI uses (src/lib/problem-authoring.ts), so an API-created problem is
 * indistinguishable from a hand-authored one and the publish gate still
 * applies before it goes live. */
export async function POST(req: Request) {
  try {
    const key = await requireApiKey(req, "problems:write");
    assertCan(key.owner, "problem:create");

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());
    const body = parsed.data;

    const problem = await createProblem(key.owner.id, key.owner.institutionId, {
      title: body.title,
      slug: body.slug,
      difficulty: body.difficulty,
      visibility: body.visibility,
      statementMd: body.statement_md,
      timeLimitMs: body.time_limit_ms,
      memoryLimitMb: body.memory_limit_mb,
    });

    return v1Data(
      {
        id: problem.id,
        slug: problem.slug,
        title: problem.title,
        status: problem.status,
        current_version_id: problem.versions[0]?.id ?? null,
      },
      undefined,
      201
    );
  } catch (err) {
    return v1Error(err);
  }
}
