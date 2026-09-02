import { NextRequest, NextResponse } from "next/server";
import { listTags } from "@/lib/tags";
import { toResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const items = await listTags({
      q: searchParams.get("q") ?? undefined,
      category: searchParams.get("category") ?? undefined,
    });
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return toResponse(err);
  }
}
