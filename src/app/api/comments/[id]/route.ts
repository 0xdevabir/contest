import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, AuthError, ForbiddenError, NotFoundError, ConflictError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const EDIT_WINDOW_MS = 15 * 60_000;

function withinEditWindow(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() <= EDIT_WINDOW_MS;
}

const patchSchema = z.object({
  body: z.string().trim().min(1).max(4000).optional(),
  hide: z.boolean().optional(),
  reason: z.string().max(300).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) throw new AuthError();

    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundError("Comment not found");

    const isModerator = can(session, "comment:moderate");
    const isAuthor = comment.userId === session.id;

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid update", parsed.error.flatten());
    const data = parsed.data;

    if (data.hide !== undefined) {
      if (!isModerator) throw new ForbiddenError("Only a moderator can hide or restore a comment");
      const updated = await prisma.comment.update({
        where: { id },
        data: data.hide
          ? { hiddenAt: new Date(), hiddenById: session.id, hiddenReason: data.reason ?? "" }
          : { hiddenAt: null, hiddenById: null, hiddenReason: null },
      });
      await recordAdminAction({
        actorId: session.id,
        action: data.hide ? "comment.hide" : "comment.restore",
        targetType: "SYSTEM",
        targetId: id,
        details: { reason: data.reason ?? "" },
      });
      return NextResponse.json({ ok: true, comment: updated });
    }

    if (data.body !== undefined) {
      if (!isAuthor && !isModerator) throw new ForbiddenError();
      if (isAuthor && !isModerator && !withinEditWindow(comment.createdAt)) {
        throw new ConflictError("Edit window has closed");
      }
      const updated = await prisma.comment.update({
        where: { id },
        data: { body: data.body, editedAt: new Date() },
      });
      return NextResponse.json({ ok: true, comment: updated });
    }

    throw new ValidationError("Nothing to update");
  } catch (err) {
    return toResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) throw new AuthError();

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: { _count: { select: { replies: true } } },
    });
    if (!comment) throw new NotFoundError("Comment not found");

    const isModerator = can(session, "comment:moderate");
    const isAuthor = comment.userId === session.id;
    if (!isAuthor && !isModerator) throw new ForbiddenError();

    if (isAuthor && !isModerator) {
      if (!withinEditWindow(comment.createdAt)) throw new ConflictError("Edit window has closed");
      if (comment._count.replies === 0) {
        await prisma.comment.delete({ where: { id } });
        return NextResponse.json({ ok: true, hardDeleted: true });
      }
    }

    // Has replies, or a moderator action — soft-delete so the thread's
    // reply history doesn't break.
    await prisma.comment.update({
      where: { id },
      data: { hiddenAt: new Date(), hiddenById: session.id, hiddenReason: isModerator ? "moderator delete" : "author delete" },
    });
    if (isModerator && !isAuthor) {
      await recordAdminAction({ actorId: session.id, action: "comment.delete", targetType: "SYSTEM", targetId: id, details: {} });
    }
    return NextResponse.json({ ok: true, hardDeleted: false });
  } catch (err) {
    return toResponse(err);
  }
}
