import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, AuthError, NotFoundError } from "@/lib/errors";
import { deliverWebhookAttempt, listDeliveries } from "@/lib/webhooks";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; deliveryId: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    const { id, deliveryId } = await params;

    // requireOwnedWebhook isn't exported directly; listDeliveries already
    // enforces ownership, so use it as the authorization check.
    await listDeliveries(id, session);

    const original = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
    if (!original || original.webhookId !== id) throw new NotFoundError("Delivery not found");

    const replay = await prisma.webhookDelivery.create({
      data: { webhookId: id, event: original.event, payload: original.payload as never },
    });
    await deliverWebhookAttempt(replay.id, 1);

    const updated = await prisma.webhookDelivery.findUnique({ where: { id: replay.id } });
    return NextResponse.json({ ok: true, delivery: updated });
  } catch (err) {
    return toResponse(err);
  }
}
