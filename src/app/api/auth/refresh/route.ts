import { NextRequest, NextResponse } from "next/server";
import { rotateRefreshToken } from "@/lib/auth";
import { clientIp } from "@/lib/request-context";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const outcome = await rotateRefreshToken({
      userAgent: req.headers.get("user-agent") ?? "",
      ip: clientIp(req),
    });
    if (!outcome.ok) {
      throw new AuthError(
        outcome.reason === "reuse_detected"
          ? "This session was signed out for your security. Sign in again."
          : "Session expired. Sign in again."
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
