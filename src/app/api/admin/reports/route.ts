import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse } from "@/lib/errors";

export const runtime = "nodejs";

const STATUSES = ["OPEN", "ACTIONED", "DISMISSED"] as const;

/** The moderation queue (D7's scope: "report, hide, ban-from-commenting, an
 * audit trail"). Admin-only. */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "comment:moderate");

    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const status = STATUSES.includes(statusParam as (typeof STATUSES)[number])
      ? (statusParam as (typeof STATUSES)[number])
      : "OPEN";

    const reports = await prisma.contentReport.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    const reporters = await prisma.user.findMany({
      where: { id: { in: reports.map((r) => r.reporterId) } },
      select: { id: true, name: true, email: true },
    });
    const reporterById = new Map(reporters.map((u) => [u.id, u]));

    return NextResponse.json({
      ok: true,
      reports: reports.map((r) => ({ ...r, reporter: reporterById.get(r.reporterId) ?? null })),
    });
  } catch (err) {
    return toResponse(err);
  }
}
