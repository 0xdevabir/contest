import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { toResponse } from "@/lib/errors";
import { getAiUsageSummary } from "@/lib/ai/usage";

export const runtime = "nodejs";

/** Acceptance criterion 8 — "Per-institution budgets are enforced before
 * the call, and /admin/costs reports AI spend alongside infrastructure
 * spend." This is the data source; the /admin/costs page renders it. */
export async function GET() {
  try {
    const session = await getSession();
    assertCan(session, "ai:viewUsage");

    const [summary, recentJobs] = await Promise.all([
      getAiUsageSummary(),
      prisma.aiJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          kind: true,
          status: true,
          model: true,
          costCents: true,
          accepted: true,
          createdAt: true,
          finishedAt: true,
          institutionId: true,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, ...summary, recentJobs });
  } catch (err) {
    return toResponse(err);
  }
}
