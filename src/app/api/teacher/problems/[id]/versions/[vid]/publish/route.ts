import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { toResponse, ForbiddenError } from "@/lib/errors";
import { requireOwnedVersion, publishVersion } from "@/lib/problem-authoring";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; vid: string }> };

/** 422 if the publish gate fails. `force: true` bypasses a failing gate —
 * restricted to admins ("publish anyway", spec's frontend surface table). */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id, vid } = await params;
    const session = await getSession();
    await requireOwnedVersion(id, vid, session!);

    const body = await req.json().catch(() => ({}));
    const force = Boolean(body?.force);
    if (force && session!.role !== "ADMIN") {
      throw new ForbiddenError("Only an admin can publish over a failing gate.");
    }

    const { gate } = await publishVersion(id, vid, { force });
    if (!gate.passed && !force) {
      return NextResponse.json({ ok: false, code: "GATE_FAILED", message: "Publish gate failed", gate }, { status: 422 });
    }

    await recordAdminAction({
      actorId: session!.id,
      action: force ? "PROBLEM_PUBLISHED_FORCED" : "PROBLEM_PUBLISHED",
      targetType: "PROBLEM",
      targetId: id,
      details: { versionId: vid, gatePassed: gate.passed },
    });

    return NextResponse.json({ ok: true, gate });
  } catch (err) {
    return toResponse(err);
  }
}
