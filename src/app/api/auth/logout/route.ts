import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { clearSessionCookie, revokeSession, SESSION_COOKIE } from "@/lib/auth";
import { toResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST() {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    const secret = process.env.AUTH_SECRET;
    if (token && secret) {
      try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
        if (typeof payload.sid === "string") {
          await revokeSession(payload.sid, "logout");
        }
      } catch {
        /* token already invalid — nothing to revoke */
      }
    }
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
