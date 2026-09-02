import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { applyContestRating, recomputeAllRatings } from "@/lib/rating/compute";
import { recomputeAllProblemRatings } from "@/lib/rating/problem-rating";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({ contestId: z.string().optional(), force: z.boolean().optional() });

/**
 * D1 — "must be recomputable from scratch and produce identical results".
 * With `contestId`, force-rates one contest (the admin override for a
 * smaller/private contest a doc's Risks table calls out). Without it, wipes
 * and replays every rated contest's final snapshot — the standard repair
 * path for a rating-engine bug.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "system:admin");

    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw new ValidationError("Invalid request", parsed.error.flatten());

    const result = parsed.data.contestId
      ? await applyContestRating(parsed.data.contestId, { force: parsed.data.force ?? true })
      : await recomputeAllRatings();

    const problemRatings = await recomputeAllProblemRatings();

    await recordAdminAction({
      actorId: session.id,
      action: "ratings.recompute",
      targetType: "SYSTEM",
      targetId: parsed.data.contestId ?? null,
      details: { ...result, problemRatings },
    });

    return NextResponse.json({ ok: true, result, problemRatings });
  } catch (err) {
    return toResponse(err);
  }
}
