import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse, ValidationError, NotFoundError, ConflictError } from "@/lib/errors";
import { contestRulesSchema, defaultContestRules } from "@/lib/validators";
import { recordAdminAction } from "@/lib/admin-audit";
import { replaceContestProblems } from "@/lib/contest-mutations";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().max(5000).optional(),
  durationMinutes: z.number().int().min(10).max(24 * 60).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "LIVE", "ENDED"]).optional(),
  rules: contestRulesSchema.partial().optional(),
  problemIds: z.array(z.string()).min(1).max(50).optional(),
  action: z.enum(["go-live", "deactivate", "end", "schedule"]).optional(),
  visibility: z.enum(["PUBLIC", "UNLISTED", "INSTITUTION", "PRIVATE"]).optional(),
  joinPolicy: z.enum(["OPEN", "CODE", "PASSWORD", "ROSTER", "INVITE", "STAFF_ONLY"]).optional(),
});

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "system:admin");
    const { id } = await params;
    const contest = await prisma.contest.findUnique({
      where: { id },
      include: {
        problems: { orderBy: { order: "asc" } },
        _count: { select: { registrations: true, submissions: true } },
      },
    });
    if (!contest) throw new NotFoundError();
    return NextResponse.json({ ok: true, contest });
  } catch (err) {
    return toResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "system:admin");
    const admin = session;
    const { id } = await params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid data");

    const existing = await prisma.contest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError();

    const data = parsed.data;
    let status = data.status ?? existing.status;
    let startsAt = data.startsAt !== undefined
      ? data.startsAt
        ? new Date(data.startsAt)
        : null
      : existing.startsAt;
    let endsAt = data.endsAt !== undefined
      ? data.endsAt
        ? new Date(data.endsAt)
        : null
      : existing.endsAt;

    if (data.action === "go-live") {
      status = "LIVE";
      startsAt = new Date();
      const duration = data.durationMinutes ?? existing.durationMinutes;
      endsAt = new Date(startsAt.getTime() + duration * 60_000);
    } else if (data.action === "deactivate") {
      status = "DRAFT";
      startsAt = null;
      endsAt = null;
    } else if (data.action === "end") {
      status = "ENDED";
      endsAt = new Date();
    } else if (data.action === "schedule") {
      status = "SCHEDULED";
      if (!startsAt) {
        throw new ValidationError("startsAt required to schedule");
      }
    }
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new ValidationError("End time must be after start time");
    }

    const rules = data.rules
      ? { ...defaultContestRules, ...(existing.rules as object), ...data.rules }
      : undefined;

    const contest = await prisma.$transaction(async (tx) => {
      if (data.problemIds) await replaceContestProblems(tx, id, data.problemIds);

      return tx.contest.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          durationMinutes: data.durationMinutes,
          startsAt,
          endsAt,
          status,
          visibility: data.visibility,
          joinPolicy: data.joinPolicy,
          ...(rules ? { rules } : {}),
        },
        include: { problems: { orderBy: { order: "asc" } } },
      });
    });
    await recordAdminAction({
      actorId: admin.id,
      action: data.action ? `CONTEST_${data.action.toUpperCase().replace("-", "_")}` : "CONTEST_UPDATED",
      targetType: "CONTEST",
      targetId: id,
      details: {
        title: contest.title,
        changed: Object.keys(data).filter((key) => key !== "problemIds"),
        problemCount: data.problemIds?.length,
      },
    });

    return NextResponse.json({ ok: true, contest });
  } catch (err) {
    return toResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "system:admin");
    const admin = session;
    const { id } = await params;
    const contest = await prisma.contest.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!contest) throw new NotFoundError();
    if (contest.status === "LIVE") {
      throw new ConflictError("End the live contest before deleting it");
    }
    await prisma.contest.delete({ where: { id } });
    await recordAdminAction({
      actorId: admin.id,
      action: "CONTEST_DELETED",
      targetType: "CONTEST",
      targetId: id,
      details: { status: contest.status },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
