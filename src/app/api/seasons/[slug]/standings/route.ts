import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertRatingsEnabled } from "@/lib/ratings-flag";
import { getSeasonStandings } from "@/lib/seasons";
import { toResponse, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Props) {
  try {
    const session = await getSession().catch(() => null);
    await assertRatingsEnabled(session);

    const { slug } = await params;
    const data = await getSeasonStandings(slug);
    if (!data) throw new NotFoundError("Season not found");
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    return toResponse(err);
  }
}
