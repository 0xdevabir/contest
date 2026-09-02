import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { toResponse, ValidationError } from "@/lib/errors";
import { requireOwnedVersion, updateVersionContent } from "@/lib/problem-authoring";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; vid: string }> };

const checkerTypes = ["EXACT", "TOKEN", "FLOAT", "SPECIAL", "INTERACTIVE"] as const;

const patchSchema = z.object({
  statementMd: z.string().max(50_000).optional(),
  statementBn: z.string().max(50_000).nullable().optional(),
  inputSpec: z.string().max(10_000).optional(),
  outputSpec: z.string().max(10_000).optional(),
  constraints: z.string().max(10_000).optional(),
  notes: z.string().max(10_000).optional(),
  starterCode: z.record(z.string(), z.string()).optional(),
  timeLimitMs: z.number().int().min(100).max(20_000).optional(),
  memoryLimitMb: z.number().int().min(16).max(1024).optional(),
  outputLimitKb: z.number().int().min(1).max(65_536).optional(),
  checkerType: z.enum(checkerTypes).optional(),
  checkerEps: z.number().nullable().optional(),
  checkerCode: z.string().max(50_000).nullable().optional(),
  checkerLang: z.string().max(40).nullable().optional(),
});

/** 409 if the version is frozen (published or referenced by a contest) —
 * the caller should fork instead. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id, vid } = await params;
    const session = await getSession();
    await requireOwnedVersion(id, vid, session!);

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const version = await updateVersionContent(vid, parsed.data);
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    return toResponse(err);
  }
}
