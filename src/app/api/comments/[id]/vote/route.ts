import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { toResponse, AuthError, NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) throw new AuthError();

    const limited = await consume({ bucket: "comment:vote", identity: session.id }, { tokens: 60, windowSec: 300 });
    if (!limited.ok) throw new RateLimitError(retryAfterSeconds(limited.resetAt));

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid vote", parsed.error.flatten());

    const comment = await prisma.comment.findUnique({ where: { id }, select: { id: true } });
    if (!comment) throw new NotFoundError("Comment not found");

    const score = await prisma.$transaction(async (tx) => {
      if (parsed.data.value === 0) {
        await tx.commentVote.deleteMany({ where: { commentId: id, userId: session!.id } });
      } else {
        await tx.commentVote.upsert({
          where: { commentId_userId: { commentId: id, userId: session!.id } },
          update: { value: parsed.data.value },
          create: { commentId: id, userId: session!.id, value: parsed.data.value },
        });
      }
      const agg = await tx.commentVote.aggregate({ where: { commentId: id }, _sum: { value: true } });
      const total = agg._sum.value ?? 0;
      await tx.comment.update({ where: { id }, data: { score: total } });
      return total;
    });

    return NextResponse.json({ ok: true, score });
  } catch (err) {
    return toResponse(err);
  }
}
