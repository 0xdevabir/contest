import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, refreshSessionFromDb } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { matchInstitutionByEmail } from "@/lib/institutions";
import { toResponse, AuthError, ValidationError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({ institutionId: z.string().trim().min(1) });

/** Changing institution re-runs the domain match — evidence still wins over a claim. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw new ValidationError("Choose an institution");

    const institution = await prisma.institution.findUnique({
      where: { id: parsed.data.institutionId },
    });
    if (!institution) throw new NotFoundError("Institution not found");

    const domainMatch = await matchInstitutionByEmail(session.email);
    const verified = domainMatch?.institutionId === institution.id;

    await prisma.user.update({
      where: { id: session.id },
      data: {
        institutionId: institution.id,
        institutionVerifiedAt: verified ? new Date() : null,
        institutionVerifiedBy: null,
      },
    });
    await refreshSessionFromDb(session.id);

    return NextResponse.json({ ok: true, verified });
  } catch (err) {
    return toResponse(err);
  }
}
