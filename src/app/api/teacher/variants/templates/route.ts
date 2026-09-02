import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireOwnedProblem } from "@/lib/problem-authoring";
import { parameterSpecSchema } from "@/lib/integrity/variants/spec";
import { toResponse, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  problemId: z.string().min(1),
  statementTemplate: z.string().min(1),
  parameterSpec: parameterSpecSchema,
  generatorSource: z.string().min(1),
  generatorLang: z.string().min(1).default("cpp20"),
  referenceSource: z.string().min(1),
  referenceLang: z.string().min(1).default("cpp20"),
  testPlan: z.record(z.string(), z.unknown()).default({}),
});

/** D3 — a teacher defines the parameter spec plus generator/reference
 * sources once; per-student variants are drawn from it on demand
 * (`getOrGenerateVariant`). Same ownership gate as any other problem edit. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());
    const data = parsed.data;

    await requireOwnedProblem(data.problemId, session!);

    const template = await prisma.problemVariantTemplate.upsert({
      where: { problemId: data.problemId },
      create: {
        problemId: data.problemId,
        statementTemplate: data.statementTemplate,
        parameterSpec: data.parameterSpec as never,
        generatorSource: data.generatorSource,
        generatorLang: data.generatorLang,
        referenceSource: data.referenceSource,
        referenceLang: data.referenceLang,
        testPlan: data.testPlan as never,
        createdById: session!.id,
      },
      update: {
        statementTemplate: data.statementTemplate,
        parameterSpec: data.parameterSpec as never,
        generatorSource: data.generatorSource,
        generatorLang: data.generatorLang,
        referenceSource: data.referenceSource,
        referenceLang: data.referenceLang,
        testPlan: data.testPlan as never,
      },
    });

    return NextResponse.json({ ok: true, template });
  } catch (err) {
    return toResponse(err);
  }
}
