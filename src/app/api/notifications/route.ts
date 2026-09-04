import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const take = Math.min(100, Math.max(1, Number(url.searchParams.get("take")) || 30));
    const cursor = url.searchParams.get("cursor") || undefined;

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: session.id, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.notification.count({ where: { userId: session.id, readAt: null } }),
    ]);

    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;

    return NextResponse.json({
      ok: true,
      notifications: page,
      unreadCount,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  } catch (err) {
    return toResponse(err);
  }
}
