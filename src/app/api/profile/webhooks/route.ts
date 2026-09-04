import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, AuthError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { createWebhook, listWebhooksForUser, WEBHOOK_EVENTS } from "@/lib/webhooks";

export const runtime = "nodejs";

const bodySchema = z.object({
  apiKeyId: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    const webhooks = await listWebhooksForUser(session.id);
    return NextResponse.json({
      ok: true,
      webhooks: webhooks.map((w) => ({
        id: w.id,
        apiKeyId: w.apiKeyId,
        apiKeyName: w.apiKey.name,
        url: w.url,
        events: w.events,
        active: w.active,
        failCount: w.failCount,
        lastFailAt: w.lastFailAt,
        createdAt: w.createdAt,
      })),
    });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const apiKey = await prisma.apiKey.findUnique({ where: { id: parsed.data.apiKeyId } });
    if (!apiKey) throw new NotFoundError("API key not found");
    if (apiKey.userId !== session.id) throw new ForbiddenError();

    const webhook = await createWebhook(apiKey.id, parsed.data);
    // The signing secret is shown once, at creation.
    return NextResponse.json({ ok: true, webhook: { id: webhook.id, url: webhook.url, events: webhook.events, secret: webhook.secret } });
  } catch (err) {
    return toResponse(err);
  }
}
