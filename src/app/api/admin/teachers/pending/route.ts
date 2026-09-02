import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    assertCan(session, "teacher:approve");

    const items = await prisma.user.findMany({
      where: { role: "TEACHER", teacherApprovedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        teacherRequestNote: true,
        createdAt: true,
        emailVerified: true,
        institution: { select: { name: true, shortName: true } },
      },
    });

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return toResponse(err);
  }
}
