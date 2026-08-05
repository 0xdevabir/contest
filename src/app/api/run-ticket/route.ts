import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { issueRunTicket } from "@/lib/run-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const runnerUrl = process.env.NEXT_PUBLIC_RUNNER_URL?.trim();
  if (!runnerUrl) {
    return NextResponse.json(
      { ok: false, message: "Interactive runner is not configured." },
      { status: 503 }
    );
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
