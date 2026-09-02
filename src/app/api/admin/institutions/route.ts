import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, ConflictError } from "@/lib/errors";

export const runtime = "nodejs";

const INSTITUTION_TYPES = [
  "PUBLIC_UNIVERSITY",
  "PRIVATE_UNIVERSITY",
  "NATIONAL_UNIVERSITY_COLLEGE",
  "POLYTECHNIC",
  "COLLEGE",
  "SCHOOL",
  "OTHER",
] as const;

const createSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers, and hyphens"),
  name: z.string().trim().min(2).max(200),
  shortName: z.string().trim().min(1).max(40),
  type: z.enum(INSTITUTION_TYPES).default("PRIVATE_UNIVERSITY"),
  district: z.string().trim().max(80).optional().or(z.literal("")),
  division: z.string().trim().max(80).optional().or(z.literal("")),
  websiteUrl: z.string().trim().url().optional().or(z.literal("")),
  logoUrl: z.string().trim().url().optional().or(z.literal("")),
  verified: z.boolean().default(false),
});

const pageSize = 30;

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    assertCan(session, "institution:manage");

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const q = searchParams.get("q")?.trim();

    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { shortName: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.institution.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { domains: true, users: true } } },
      }),
      prisma.institution.count({ where }),
    ]);

    return NextResponse.json({ ok: true, items, total, page, pageSize });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "institution:manage");

    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid institution", parsed.error.flatten());
    }
    const data = parsed.data;

    const exists = await prisma.institution.findUnique({ where: { slug: data.slug } });
    if (exists) throw new ConflictError("An institution with this slug already exists");

    const institution = await prisma.institution.create({
      data: {
        slug: data.slug,
        name: data.name,
        shortName: data.shortName,
        type: data.type,
        district: data.district || null,
        division: data.division || null,
        websiteUrl: data.websiteUrl || null,
        logoUrl: data.logoUrl || null,
        verified: data.verified,
      },
    });

    await recordAdminAction({
      actorId: session!.id,
      action: "INSTITUTION_CREATED",
      targetType: "SYSTEM",
      targetId: institution.id,
      details: { slug: institution.slug, name: institution.name },
    });

    return NextResponse.json({ ok: true, institution });
  } catch (err) {
    return toResponse(err);
  }
}
