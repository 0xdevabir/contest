import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, ValidationError } from "@/lib/errors";
import { requireOwnedVersion, assertVersionEditable } from "@/lib/problem-authoring";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; vid: string }> };

const bodySchema = z.object({
  language: z.string().trim().min(1).max(20).default("c"),
  source: z.string().min(1).max(200_000),
  expectedVerdict: z.enum(["AC", "WA", "CE", "RE", "TLE", "MLE"]).default("AC"),
  note: z.string().max(500).default(""),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { id, vid } = await params;
    const session = await getSession();
    await requireOwnedVersion(id, vid, session!);
    await assertVersionEditable(vid);

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid reference solution data", parsed.error.flatten());

    const reference = await prisma.referenceSolution.create({
      data: { problemVersionId: vid, ...parsed.data },
    });
    return NextResponse.json({ ok: true, reference });
  } catch (err) {
    return toResponse(err);
  }
}
