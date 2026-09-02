import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse, ValidationError, ServiceUnavailableError } from "@/lib/errors";
import { getJudgeQueue } from "@/lib/queue/queue";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

const BodySchema = z.object({ action: z.enum(["pause", "resume"]) });

/** Maintenance switch — pausing stops new jobs from being picked up; in-flight jobs finish. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "system:admin");

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) throw new ValidationError("Invalid body", parsed.error.flatten());

    const queue = getJudgeQueue();
    if (!queue) throw new ServiceUnavailableError("Queue is not configured.");

    if (parsed.data.action === "pause") await queue.pause();
    else await queue.resume();

    await recordAdminAction({
      actorId: session.id,
      action: parsed.data.action === "pause" ? "QUEUE_PAUSED" : "QUEUE_RESUMED",
      targetType: "SYSTEM",
    });

    return NextResponse.json({ ok: true, paused: await queue.isPaused() });
  } catch (err) {
    return toResponse(err);
  }
}
