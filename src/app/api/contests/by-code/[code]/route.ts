import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/request-context";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { toResponse, NotFoundError, RateLimitError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ code: string }> };

/** Resolves a join code to its contest id/slug so /contests/join can hand the
 * user off to the real join flow without asking them for an id up front.
 * Deliberately returns only id/slug/title — never whether a password is also
 * required, which would leak information to someone guessing codes.
 * IP-rate-limited on top of the code space itself (8 chars, ~33^8 possibilities)
 * as defense in depth against a lookup-oracle brute force. */
export async function GET(req: Request, { params }: Params) {
  try {
    const limited = await consume(
      { bucket: "join:lookup", identity: clientIp(req) },
      { tokens: 20, windowSec: 3600 }
    );
    if (!limited.ok) throw new RateLimitError(retryAfterSeconds(limited.resetAt));

    const { code } = await params;
    const contest = await prisma.contest.findUnique({
      where: { joinCode: code.trim().toUpperCase() },
      select: { id: true, slug: true, title: true, joinPolicy: true },
    });
    if (!contest || (contest.joinPolicy !== "CODE" && contest.joinPolicy !== "PASSWORD")) {
      throw new NotFoundError("No contest matches that code");
    }
    return NextResponse.json({ ok: true, contest });
  } catch (err) {
    return toResponse(err);
  }
}
