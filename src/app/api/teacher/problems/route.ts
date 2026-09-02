import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { toResponse, ValidationError } from "@/lib/errors";
import { createProblem } from "@/lib/problem-authoring";
import { prismaDifficultyToLabel } from "@/lib/difficulty";

export const runtime = "nodejs";

const DIFFICULTIES = ["VERY EASY", "EASY", "MEDIUM", "MEDIUM-HARD", "HARD", "VERY HARD", "EXTREME"] as const;

const createSchema = z.object({
  title: z.string().trim().min(3).max(160),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Lowercase letters, digits, and hyphens only"),
  difficulty: z.enum(DIFFICULTIES),
  visibility: z.enum(["PUBLIC", "INSTITUTION", "PRIVATE"]).default("PRIVATE"),
  statementMd: z.string().max(50_000).default(""),
  timeLimitMs: z.number().int().min(100).max(20_000).optional(),
  memoryLimitMb: z.number().int().min(16).max(1024).optional(),
});

export async function GET() {
  try {
    const session = await getSession();
    assertCan(session, "problem:create");

    const problems = await prisma.problem.findMany({
      where: session!.role === "ADMIN" ? {} : { authorId: session!.id },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { versions: true } },
        currentVersion: { select: { version: true, frozen: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      problems: problems.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        status: p.status,
        visibility: p.visibility,
        difficulty: prismaDifficultyToLabel(p.difficulty),
        versionCount: p._count.versions,
        currentVersion: p.currentVersion?.version ?? null,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    assertCan(session, "problem:create");

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid problem data", parsed.error.flatten());

    const problem = await createProblem(session!.id, session!.institutionId, parsed.data);
    return NextResponse.json({ ok: true, problem });
  } catch (err) {
    return toResponse(err);
  }
}
