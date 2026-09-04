import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toResponse, AuthError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({ ids: z.array(z.string()).max(200).optional() });

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const { count } = await prisma.notification.updateMany({
      where: {
        userId: session.id,
        readAt: null,
        ...(parsed.data.ids ? { id: { in: parsed.data.ids } } : {}),
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true, updated: count });
  } catch (err) {
    return toResponse(err);
  }
}
