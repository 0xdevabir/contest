import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { toResponse, AuthError } from "@/lib/errors";
import { deleteWebhook, listDeliveries } from "@/lib/webhooks";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    const { id } = await params;
    const deliveries = await listDeliveries(id, session);
    return NextResponse.json({ ok: true, deliveries });
  } catch (err) {
    return toResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    const { id } = await params;
    await deleteWebhook(id, session);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
