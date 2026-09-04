import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  NOTIFICATION_TYPE_LIST,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@/lib/notify/types";
import { isDigestEnabled, setDigestEnabled } from "@/lib/notify/digest";
import { toResponse, AuthError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const [rows, digestEnabled] = await Promise.all([
      prisma.notificationPreference.findMany({
        where: { userId: session.id, type: { in: NOTIFICATION_TYPE_LIST } },
        select: { type: true, channels: true },
      }),
      isDigestEnabled(session.id),
    ]);
    const byType = new Map(rows.map((r) => [r.type, r.channels]));

    const types = NOTIFICATION_TYPE_LIST.map((type) => ({
      type,
      label: NOTIFICATION_TYPE_LABELS[type],
      channels: byType.get(type) ?? NOTIFICATION_TYPES[type].defaultChannels,
    }));

    return NextResponse.json({ ok: true, types, digestEnabled });
  } catch (err) {
    return toResponse(err);
  }
}

const channelSchema = z.enum(["INAPP", "EMAIL", "PUSH"]);
const bodySchema = z.union([
  z.object({ type: z.enum(NOTIFICATION_TYPE_LIST as [NotificationType, ...NotificationType[]]), channels: z.array(channelSchema) }),
  z.object({ digestEnabled: z.boolean() }),
]);

export async function PUT(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid preference update", parsed.error.flatten());

    if ("digestEnabled" in parsed.data) {
      await setDigestEnabled(session.id, parsed.data.digestEnabled);
      return NextResponse.json({ ok: true });
    }

    await prisma.notificationPreference.upsert({
      where: { userId_type: { userId: session.id, type: parsed.data.type } },
      update: { channels: parsed.data.channels },
      create: { userId: session.id, type: parsed.data.type, channels: parsed.data.channels },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
