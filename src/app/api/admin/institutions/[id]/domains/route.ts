import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, NotFoundError, ConflictError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, "Enter a valid domain"),
  roleHint: z.enum(["STUDENT", "TEACHER", "TA", "ADMIN"]).optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "institution:manage");
    const { id } = await params;

    const institution = await prisma.institution.findUnique({ where: { id } });
    if (!institution) throw new NotFoundError("Institution not found");

    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid domain");
    }

    // gmail.com and other free-mail domains never get to participate in
    // automatic verification — an admin explicitly registering one here
    // would be exploitable by anyone with that mailbox.
    if (FREE_MAIL_DOMAINS.has(parsed.data.domain)) {
      throw new ConflictError("Free email domains cannot be used for institution verification");
    }

    const exists = await prisma.institutionDomain.findUnique({
      where: { domain: parsed.data.domain },
    });
    if (exists) throw new ConflictError("This domain is already registered");

    const row = await prisma.institutionDomain.create({
      data: { institutionId: id, domain: parsed.data.domain, roleHint: parsed.data.roleHint },
    });

    await recordAdminAction({
      actorId: session!.id,
      action: "INSTITUTION_DOMAIN_ADDED",
      targetType: "SYSTEM",
      targetId: id,
      details: { domain: row.domain },
    });

    return NextResponse.json({ ok: true, domain: row });
  } catch (err) {
    return toResponse(err);
  }
}

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "protonmail.com",
]);
