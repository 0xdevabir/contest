import { NextResponse } from "next/server";
import { getSession, getCurrentSessionId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const [rows, currentSid] = await Promise.all([
      prisma.session.findMany({
        where: { userId: session.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: "desc" },
        select: {
          id: true,
          userAgent: true,
          ip: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
        },
      }),
      getCurrentSessionId(),
    ]);

    return NextResponse.json({
      ok: true,
      sessions: rows.map((r) => ({ ...r, isCurrent: r.id === currentSid })),
    });
  } catch (err) {
    return toResponse(err);
  }
}
