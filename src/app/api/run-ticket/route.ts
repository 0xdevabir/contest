import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { issueRunTicket } from "@/lib/run-ticket";
import { toResponse, RateLimitError } from "@/lib/errors";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { clientIp } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    return toResponse(err);
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const runnerUrl = process.env.NEXT_PUBLIC_RUNNER_URL?.trim();
  if (!runnerUrl) {
    return NextResponse.json(
      { ok: false, message: "Interactive runner is not configured." },
      { status: 503 }
    );
  }

  const rl = await consume(
    { bucket: "runticket", identity: clientIp(req) },
    { tokens: 5, windowSec: 5 * 60 }
  );
  if (!rl.ok) {
    throw new RateLimitError(retryAfterSeconds(rl.resetAt), "Too many terminal sessions requested. Try again shortly.");
  }

  let subject = "anon";
  try {
    const session = await getSession();
    if (session) subject = session.id;
  } catch {
    // an anonymous visitor can still run code, just under the anon quota
  }

  const ticket = issueRunTicket(subject);
  if (!ticket) {
    return NextResponse.json(
      { ok: false, message: "Interactive runner is not configured." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, ticket, url: runnerUrl });
}
