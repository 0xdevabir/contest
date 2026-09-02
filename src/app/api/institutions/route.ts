import { NextRequest, NextResponse } from "next/server";
import { listInstitutions } from "@/lib/institutions";
import { toResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const items = await listInstitutions({
      q: searchParams.get("q") ?? undefined,
      verifiedOnly: searchParams.get("verified") === "true",
      limit: 100,
    });
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return toResponse(err);
  }
}
