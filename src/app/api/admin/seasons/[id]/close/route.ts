import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { closeSeason } from "@/lib/seasons";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 120;

type Props = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Props) {
  try {
    const session = await getSession();
    assertCan(session, "system:admin");

    const { id } = await params;
    const result = await closeSeason(id);

    await recordAdminAction({
      actorId: session.id,
      action: "season.close",
      targetType: "SEASON",
      targetId: id,
      details: result,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return toResponse(err);
  }
}
