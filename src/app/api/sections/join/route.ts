import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { toResponse, ConflictError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({ inviteCode: z.string().trim().max(16) });

/**
 * Self-enrol by invite code. `openEnroll` sections enrol immediately; the
 * schema (D — EnrollmentStatus is only INVITED/ACTIVE/DROPPED) has no
 * pending-approval state, so a non-open section politely declines and
 * points the student at their teacher instead of inventing a status the
 * doc's schema doesn't define.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new ForbiddenError("Sign in to continue.");
    await assertClassroomEnabled(session);

    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid invite code");

    const limited = await consume({ bucket: "join:section", identity: session.id }, { tokens: 10, windowSec: 3600 });
    if (!limited.ok) throw new RateLimitError(retryAfterSeconds(limited.resetAt));

    const section = await prisma.courseSection.findUnique({
      where: { inviteCode: parsed.data.inviteCode.toUpperCase() },
      include: { course: true },
    });
    if (!section || section.archived) throw new NotFoundError("Invalid invite code");

    if (!section.openEnroll) {
      throw new ForbiddenError("This section requires teacher approval — ask your teacher to add you to the roster");
    }

    const existing = await prisma.enrollment.findUnique({
      where: { sectionId_userId: { sectionId: section.id, userId: session.id } },
    });
    if (existing) {
      if (existing.status === "ACTIVE") throw new ConflictError("You are already enrolled in this section");
      await prisma.enrollment.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", joinedAt: new Date() },
      });
    } else {
      await prisma.enrollment.create({
        data: {
          sectionId: section.id,
          userId: session.id,
          email: session.email,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ ok: true, sectionId: section.id });
  } catch (err) {
    return toResponse(err);
  }
}
