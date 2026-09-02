import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { runAnalyticsRollup } from "@/lib/analytics/rollup";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({ sectionId: z.string().optional() });

/** Force a rollup (optionally scoped to one section) — admin only. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "system:admin");

    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw new ValidationError("Invalid request", parsed.error.flatten());

    const result = await runAnalyticsRollup({ sectionId: parsed.data.sectionId });

    await recordAdminAction({
      actorId: session.id,
      action: "analytics.rollup.force",
      targetType: "SYSTEM",
      targetId: parsed.data.sectionId ?? null,
      details: result,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return toResponse(err);
  }
}
