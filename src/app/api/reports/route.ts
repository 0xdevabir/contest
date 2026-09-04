import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { toResponse, AuthError, RateLimitError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  target: z.enum(["comment", "solution", "profile"]),
  targetId: z.string().min(1).max(64),
  reason: z.string().trim().min(1).max(1000),
});

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const limited = await consume({ bucket: "report:create", identity: session.id }, { tokens: 10, windowSec: 3600 });
    if (!limited.ok) throw new RateLimitError(retryAfterSeconds(limited.resetAt));

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid report", parsed.error.flatten());

    const report = await prisma.contentReport.create({
      data: {
        target: parsed.data.target,
        targetId: parsed.data.targetId,
        reporterId: session.id,
        reason: parsed.data.reason,
      },
    });

    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return toResponse(err);
  }
}
