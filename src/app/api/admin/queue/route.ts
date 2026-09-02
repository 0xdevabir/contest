import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { toResponse } from "@/lib/errors";
import { getQueueStats, isQueuePaused } from "@/lib/queue-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const [stats, paused] = await Promise.all([getQueueStats(), isQueuePaused()]);
    return NextResponse.json({ ok: true, ...stats, paused });
  } catch (err) {
    return toResponse(err);
  }
}
