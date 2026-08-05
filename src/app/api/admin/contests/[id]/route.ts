import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { contestRulesSchema, defaultContestRules } from "@/lib/validators";
import { getProblem } from "@/lib/problems";
import { recordAdminAction } from "@/lib/admin-audit";

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
  action: z.enum(["go-live", "end", "schedule"]).optional(),
});

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const contest = await prisma.contest.findUnique({
      where: { id },
      include: {
        problems: { orderBy: { order: "asc" } },
        _count: { select: { registrations: true, submissions: true } },
      },
    });
    if (!contest) {
      return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, contest });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") {
      return NextResponse.json({ ok: false, message: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 403 });
    }
    return NextResponse.json({ ok: false, message: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Invalid data" }, { status: 400 });
    }

    const existing = await prisma.contest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
    }

    const data = parsed.data;
    if (data.problemIds) {
      const invalidProblem = data.problemIds.find((problemId) => !getProblem(problemId));
      if (invalidProblem) {
        return NextResponse.json(
          { ok: false, message: `Unknown problem: ${invalidProblem}` },
          { status: 400 }
        );
      }
      if (new Set(data.problemIds).size !== data.problemIds.length) {
        return NextResponse.json(
          { ok: false, message: "A problem can only be added once" },
          { status: 400 }
        );
      }
    }
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
    } else if (data.action === "end") {
      status = "ENDED";
      endsAt = new Date();
    } else if (data.action === "schedule") {
      status = "SCHEDULED";
      if (!startsAt) {
        return NextResponse.json({ ok: false, message: "startsAt required to schedule" }, { status: 400 });
      }
    }
    if (startsAt && endsAt && endsAt <= startsAt) {
      return NextResponse.json(
        { ok: false, message: "End time must be after start time" },
        { status: 400 }
      );
    }

    const rules = data.rules
      ? { ...defaultContestRules, ...(existing.rules as object), ...data.rules }
      : undefined;

    const contest = await prisma.$transaction(async (tx) => {
      if (data.problemIds) {
        await tx.contestProblem.deleteMany({ where: { contestId: id } });
        const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        await tx.contestProblem.createMany({
          data: data.problemIds.map((problemId, i) => ({
            contestId: id,
            problemId,
            order: i,
            points: 100,
            label: labels[i] || `P${i + 1}`,
          })),
        });
      }

      return tx.contest.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          durationMinutes: data.durationMinutes,
          startsAt,
          endsAt,
          status,
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
    const msg = err instanceof Error ? err.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") {
      return NextResponse.json({ ok: false, message: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 403 });
    }
    console.error(err);
    return NextResponse.json({ ok: false, message: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const contest = await prisma.contest.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!contest) {
      return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
    }
    if (contest.status === "LIVE") {
      return NextResponse.json(
        { ok: false, message: "End the live contest before deleting it" },
        { status: 409 }
      );
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
    const msg = err instanceof Error ? err.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") {
      return NextResponse.json({ ok: false, message: msg }, { status: msg === "UNAUTHORIZED" ? 401 : 403 });
    }
    return NextResponse.json({ ok: false, message: "Delete failed" }, { status: 500 });
  }
}


