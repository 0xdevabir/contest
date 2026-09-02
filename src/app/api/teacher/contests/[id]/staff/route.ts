import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { toResponse, ValidationError, NotFoundError, ForbiddenError, ConflictError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["add", "remove"]),
  userId: z.string().min(1),
  role: z.enum(["OWNER", "COAUTHOR", "JUDGE", "OBSERVER"]).default("JUDGE"),
});

/** docs/phases/PHASE-05-contest-engine.md D5 — ContestStaff management,
 * gated by the `manageStaff` capability (OWNER, or an admin). */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    const { id } = await params;
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError();

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("manageStaff")) throw new ForbiddenError();

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid data");
    const { action, userId, role } = parsed.data;

    if (action === "add") {
      const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!targetUser) throw new ValidationError("Unknown user");
      const staff = await prisma.contestStaff.upsert({
        where: { contestId_userId: { contestId: id, userId } },
        update: { role },
        create: { contestId: id, userId, role, addedById: session.id },
      });
      return NextResponse.json({ ok: true, staff });
    }

    // action === "remove"
    const target = await prisma.contestStaff.findUnique({ where: { contestId_userId: { contestId: id, userId } } });
    if (!target) throw new NotFoundError("Not staff on this contest");
    if (target.role === "OWNER" && userId === contest.createdById) {
      throw new ConflictError("Cannot remove the contest's original owner");
    }
    await prisma.contestStaff.delete({ where: { contestId_userId: { contestId: id, userId } } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    const { id } = await params;
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError();
    const caps = await contestCapabilities(session, contest);
    if (!caps.has("manageStaff")) throw new ForbiddenError();

    const staff = await prisma.contestStaff.findMany({
      where: { contestId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ ok: true, staff });
  } catch (err) {
    return toResponse(err);
  }
}
