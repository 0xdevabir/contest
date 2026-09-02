import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: true, user: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        email: true,
        name: true,
        institutionId: true,
        institutionVerifiedAt: true,
        institution: { select: { slug: true, name: true, shortName: true } },
        studentId: true,
        department: true,
        role: true,
        teacherApprovedAt: true,
        emailVerified: true,
      },
    });

    return NextResponse.json({ ok: true, user });
  } catch (err) {
    return toResponse(err);
  }
}
