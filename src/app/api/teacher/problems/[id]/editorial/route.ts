import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { getProblemRef } from "@/lib/problems";
import { toResponse, NotFoundError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function resolveOwnedProblem(id: string, session: Awaited<ReturnType<typeof getSession>>) {
  const ref = await getProblemRef(id);
  if (!ref) throw new NotFoundError("Problem not found");
  const problem = await prisma.problem.findUnique({ where: { id: ref.problemId }, select: { authorId: true } });
  if (!problem) throw new NotFoundError("Problem not found");
  assertCan(session, "editorial:manage", { ownerId: problem.authorId });
  return ref.problemId;
}

/** The author's own draft, regardless of publish state — used by the
 * editing UI, unlike the public GET route which enforces D1's spoiler gate. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    const problemId = await resolveOwnedProblem(id, session);

    const editorial = await prisma.editorial.findFirst({
      where: { problemId, problemVersionId: null },
      select: { id: true, contentMd: true, solutions: true, published: true, updatedAt: true },
    });

    return NextResponse.json({ ok: true, editorial: editorial ?? null });
  } catch (err) {
    return toResponse(err);
  }
}

const solutionSchema = z.object({
  language: z.string().min(1).max(40),
  source: z.string().max(20000),
  note: z.string().max(500).default(""),
});

const bodySchema = z.object({
  contentMd: z.string().min(1).max(50000),
  solutions: z.array(solutionSchema).max(10).default([]),
  published: z.boolean().default(false),
});

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    const problemId = await resolveOwnedProblem(id, session);

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid editorial data", parsed.error.flatten());

    // problemVersionId is nullable in the unique constraint, and Postgres
    // treats NULLs as distinct in a unique index — an upsert keyed on
    // [problemId, problemVersionId] can't be trusted to dedupe the
    // "current version" (null) row, so find-then-write explicitly instead.
    const existing = await prisma.editorial.findFirst({
      where: { problemId, problemVersionId: null },
      select: { id: true },
    });

    const editorial = existing
      ? await prisma.editorial.update({
          where: { id: existing.id },
          data: { contentMd: parsed.data.contentMd, solutions: parsed.data.solutions, published: parsed.data.published },
        })
      : await prisma.editorial.create({
          data: {
            problemId,
            authorId: session!.id,
            contentMd: parsed.data.contentMd,
            solutions: parsed.data.solutions,
            published: parsed.data.published,
          },
        });

    return NextResponse.json({ ok: true, editorial });
  } catch (err) {
    return toResponse(err);
  }
}
