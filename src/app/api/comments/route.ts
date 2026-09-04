import { NextResponse } from "next/server";
import { z } from "zod";
import type { CommentTarget } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { renderComment } from "@/lib/comment-markdown";
import { canViewSpoilerComment } from "@/lib/community";
import { notify } from "@/lib/notify";
import { toResponse, AuthError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const TARGETS = ["PROBLEM", "CONTEST", "EDITORIAL", "ANNOUNCEMENT"] as const;

function hrefFor(target: CommentTarget, targetId: string): string {
  if (target === "PROBLEM") return `/problems/${targetId}#comments`;
  if (target === "EDITORIAL") return `/problems/${targetId}?tab=editorial#comments`;
  return `/contests/${targetId}#comments`;
}

const REDACTED = "[removed]";

type CommentRow = {
  id: string;
  parentId: string | null;
  userId: string;
  body: string;
  spoiler: boolean;
  score: number;
  editedAt: Date | null;
  hiddenAt: Date | null;
  createdAt: Date;
  user: { name: string };
};

async function toClientShape(c: CommentRow, actor: Awaited<ReturnType<typeof getSession>>, problemIdForGate: string | null, reveal: boolean) {
  if (c.hiddenAt) {
    return { id: c.id, parentId: c.parentId, userId: c.userId, authorName: "—", body: REDACTED, bodyHtml: REDACTED, spoiler: false, gated: false, score: c.score, editedAt: c.editedAt, createdAt: c.createdAt };
  }

  if (c.spoiler && problemIdForGate) {
    const gate = await canViewSpoilerComment(actor, problemIdForGate, reveal);
    if (!gate.visible) {
      return { id: c.id, parentId: c.parentId, userId: c.userId, authorName: c.user.name, body: null, bodyHtml: null, spoiler: true, gated: true, reason: gate.reason, score: c.score, editedAt: c.editedAt, createdAt: c.createdAt };
    }
  }

  const bodyHtml = await renderComment(c.body);
  return { id: c.id, parentId: c.parentId, userId: c.userId, authorName: c.user.name, body: c.body, bodyHtml, spoiler: c.spoiler, gated: false, score: c.score, editedAt: c.editedAt, createdAt: c.createdAt };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("target");
    const targetId = url.searchParams.get("targetId");
    const reveal = url.searchParams.get("reveal") === "1";
    if (!target || !TARGETS.includes(target as (typeof TARGETS)[number]) || !targetId) {
      throw new ValidationError("target and targetId are required");
    }

    let session = null;
    try {
      session = await getSession();
    } catch {
      session = null;
    }

    // Spoiler gating only makes sense for content tied to one problem —
    // PROBLEM and EDITORIAL targets use targetId as the problem slug.
    const problemIdForGate = target === "PROBLEM" || target === "EDITORIAL" ? targetId : null;

    const rows = await prisma.comment.findMany({
      where: { target: target as CommentTarget, targetId, parentId: null },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, parentId: true, userId: true, body: true, spoiler: true, score: true,
        editedAt: true, hiddenAt: true, createdAt: true, user: { select: { name: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true, parentId: true, userId: true, body: true, spoiler: true, score: true,
            editedAt: true, hiddenAt: true, createdAt: true, user: { select: { name: true } },
          },
        },
      },
    });

    const comments = await Promise.all(
      rows.map(async (c) => ({
        ...(await toClientShape(c, session, problemIdForGate, reveal)),
        replies: await Promise.all(c.replies.map((r) => toClientShape(r, session, problemIdForGate, reveal))),
      }))
    );

    return NextResponse.json({ ok: true, comments });
  } catch (err) {
    return toResponse(err);
  }
}

const bodySchema = z.object({
  target: z.enum(TARGETS),
  targetId: z.string().min(1).max(64),
  parentId: z.string().optional(),
  body: z.string().trim().min(1).max(4000),
  spoiler: z.boolean().default(false),
});

const MENTION_RE = /@\[([^\]]+)\]\((\w[\w-]*)\)/g;

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const isStaff = session.role === "TEACHER" || session.role === "ADMIN";
    if (!isStaff) {
      const solvedCount = await prisma.solvedProblem.count({ where: { userId: session.id } });
      if (solvedCount === 0) throw new ForbiddenError("Solve at least one problem before commenting.");
    }

    const limited = await consume({ bucket: "comment:create", identity: session.id }, { tokens: 20, windowSec: 600 });
    if (!limited.ok) throw new RateLimitError(retryAfterSeconds(limited.resetAt));

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid comment", parsed.error.flatten());
    const data = parsed.data;

    let parent: { id: string; userId: string } | null = null;
    if (data.parentId) {
      const found = await prisma.comment.findUnique({ where: { id: data.parentId }, select: { id: true, userId: true, parentId: true, target: true, targetId: true } });
      if (!found || found.target !== data.target || found.targetId !== data.targetId) {
        throw new NotFoundError("Parent comment not found");
      }
      // D2 — one level deep: a reply can't itself have a parent.
      if (found.parentId) throw new ValidationError("Replies can only be one level deep");
      parent = found;
    }

    const comment = await prisma.comment.create({
      data: {
        target: data.target,
        targetId: data.targetId,
        parentId: data.parentId ?? null,
        userId: session.id,
        body: data.body,
        spoiler: data.spoiler,
      },
    });

    const href = hrefFor(data.target, data.targetId);
    const excerpt = data.body.slice(0, 140);

    const mentionIds = new Set<string>();
    for (const match of data.body.matchAll(MENTION_RE)) {
      if (match[2] && match[2] !== session.id) mentionIds.add(match[2]);
    }
    if (mentionIds.size > 0) {
      const validMentions = await prisma.user.findMany({ where: { id: { in: Array.from(mentionIds) } }, select: { id: true } });
      if (validMentions.length > 0) {
        await notify(validMentions.map((u) => u.id), "comment:mention", { authorName: session.name, excerpt, href });
      }
    }

    if (parent && parent.userId !== session.id && !mentionIds.has(parent.userId)) {
      await notify(parent.userId, "comment:reply", { authorName: session.name, excerpt, href });
    }

    return NextResponse.json({ ok: true, comment });
  } catch (err) {
    return toResponse(err);
  }
}
