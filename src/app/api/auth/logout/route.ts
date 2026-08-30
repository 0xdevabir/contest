import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { toResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST() {
  try {
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
