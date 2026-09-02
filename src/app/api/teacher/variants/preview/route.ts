import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireOwnedProblem } from "@/lib/problem-authoring";
import { generateVariant } from "@/lib/integrity/variants/generate";
import { toResponse, NotFoundError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({ templateId: z.string().min(1) });

const PREVIEW_COUNT = 5;

export async function POST(req: Request) {
  try {
    const session = await getSession();
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid data");

    const template = await prisma.problemVariantTemplate.findUnique({ where: { id: parsed.data.templateId } });
    if (!template) throw new NotFoundError("Variant template not found");
    await requireOwnedProblem(template.problemId, session!);

    // ProblemVariant.userId is a required FK to User, so a synthetic id per
    // sample (as the doc's "preview-0..4" shorthand suggests) would violate
    // it — instead the teacher's own userId is reused across 5 distinct
    // throwaway scopeIds, which still derives 5 distinct seeds/samples
    // (deriveSeed keys on templateId+userId+scopeId) and stays invisible to
    // students since nothing in the solve flow looks up a "preview-*" scope.
    const samples = [];
    for (let i = 0; i < PREVIEW_COUNT; i++) {
      const { problemVersionId, parameters } = await generateVariant({
        templateId: template.id,
        userId: session!.id,
        scopeType: "contest",
        scopeId: `preview-${template.id}-${i}`,
      });
      const version = await prisma.problemVersion.findUnique({
        where: { id: problemVersionId },
        select: { statementMd: true },
      });
      samples.push({ parameters, statementMd: version?.statementMd ?? "" });
    }

    return NextResponse.json({ ok: true, samples });
  } catch (err) {
    return toResponse(err);
  }
}
