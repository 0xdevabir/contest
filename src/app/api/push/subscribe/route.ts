import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toResponse, AuthError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  userAgent: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const parsed = subscribeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid push subscription", parsed.error.flatten());

    const { endpoint, keys, userAgent } = parsed.data;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: session.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? "" },
      create: { userId: session.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? "" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const parsed = unsubscribeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid request", parsed.error.flatten());

    await prisma.pushSubscription
      .deleteMany({ where: { endpoint: parsed.data.endpoint, userId: session.id } })
      .catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
