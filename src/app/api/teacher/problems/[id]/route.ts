import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, ValidationError } from "@/lib/errors";
import { requireOwnedProblem, updateProblemMeta } from "@/lib/problem-authoring";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const DIFFICULTIES = ["VERY EASY", "EASY", "MEDIUM", "MEDIUM-HARD", "HARD", "VERY HARD", "EXTREME"] as const;

const patchSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  visibility: z.enum(["PUBLIC", "INSTITUTION", "PRIVATE"]).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
});

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    await requireOwnedProblem(id, session!);

    const problem = await prisma.problem.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { version: "desc" } },
        tags: { include: { tag: true } },
        stats: true,
      },
    });
    return NextResponse.json({ ok: true, problem });
  } catch (err) {
    return toResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    await requireOwnedProblem(id, session!);

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const problem = await updateProblemMeta(id, parsed.data);
    return NextResponse.json({ ok: true, problem });
  } catch (err) {
    return toResponse(err);
  }
}
