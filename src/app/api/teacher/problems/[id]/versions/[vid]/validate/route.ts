import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { toResponse } from "@/lib/errors";
import { requireOwnedVersion, runPublishGate } from "@/lib/problem-authoring";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; vid: string }> };

/**
 * Runs the publish gate without publishing — the "Validate" button in
 * PublishGate.tsx. Per-test verdicts go to the owner only; hidden test
 * *content* is never in this response (compileAndJudge's results carry
 * stdout/stderr, which runPublishGate does not surface — only pass/fail and
 * the verdict/message).
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const { id, vid } = await params;
    const session = await getSession();
    await requireOwnedVersion(id, vid, session!);

    const gate = await runPublishGate(vid);
    return NextResponse.json({ ok: true, gate });
  } catch (err) {
    return toResponse(err);
  }
}
