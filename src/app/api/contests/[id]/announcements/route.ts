import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { getRedis } from "@/lib/redis";
import { contestEventsChannel } from "@/lib/standings/channel";
import { notify } from "@/lib/notify";
import { toResponse, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  title: z.string().trim().max(200).default(""),
  body: z.string().trim().min(1).max(4000),
  problemId: z.string().trim().max(64).optional(),
});

/**
 * D1 (docs/phases/PHASE-07-live-contest.md) — the broadcast feed. GET is
 * open to anyone with `view`; POST is staff-only, and pushes onto the same
 * multiplexed channel the standings/clarification events use so a client
 * holds exactly one SSE connection.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("view")) throw new ForbiddenError();

    const announcements = await prisma.contestAnnouncement.findMany({
      where: { contestId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, body: true, problemId: true, createdAt: true, authorId: true },
      take: 100,
    });

    return NextResponse.json({ ok: true, announcements });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("viewAllSubmissions")) throw new ForbiddenError("Staff only");

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const announcement = await prisma.contestAnnouncement.create({
      data: {
        contestId: id,
        title: parsed.data.title,
        body: parsed.data.body,
        problemId: parsed.data.problemId || null,
        authorId: session!.id,
      },
    });

    const redis = getRedis();
    if (redis) {
      await redis.publish(
        contestEventsChannel(id),
        JSON.stringify({
          event: "announcement",
          data: {
            id: announcement.id,
            title: announcement.title,
            body: announcement.body,
            problemId: announcement.problemId,
            createdAt: announcement.createdAt.toISOString(),
          },
        })
      );
    }

    const registrations = await prisma.contestRegistration.findMany({
      where: { contestId: id },
      select: { userId: true },
    });
    if (registrations.length > 0) {
      notify(
        registrations.map((r) => r.userId),
        "class:announcement",
        { title: announcement.title || "Announcement", excerpt: announcement.body.slice(0, 140), href: `/contests/${contest.slug}` }
      ).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, announcement });
  } catch (err) {
    return toResponse(err);
  }
}
