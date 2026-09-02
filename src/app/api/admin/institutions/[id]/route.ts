import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const INSTITUTION_TYPES = [
  "PUBLIC_UNIVERSITY",
  "PRIVATE_UNIVERSITY",
  "NATIONAL_UNIVERSITY_COLLEGE",
  "POLYTECHNIC",
  "COLLEGE",
  "SCHOOL",
  "OTHER",
] as const;

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    shortName: z.string().trim().min(1).max(40).optional(),
    type: z.enum(INSTITUTION_TYPES).optional(),
    district: z.string().trim().max(80).nullable().optional(),
    division: z.string().trim().max(80).nullable().optional(),
    websiteUrl: z.string().trim().url().nullable().optional(),
    logoUrl: z.string().trim().url().nullable().optional(),
    verified: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No changes supplied");

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "institution:manage");
    const { id } = await params;

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid update");
    }

    const existing = await prisma.institution.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Institution not found");

    const institution = await prisma.institution.update({
      where: { id },
      data: parsed.data,
    });

    await recordAdminAction({
      actorId: session!.id,
      action: "INSTITUTION_UPDATED",
      targetType: "SYSTEM",
      targetId: id,
      details: { changed: Object.keys(parsed.data) },
    });

    return NextResponse.json({ ok: true, institution });
  } catch (err) {
    return toResponse(err);
  }
}
