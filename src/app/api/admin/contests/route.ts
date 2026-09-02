import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse, ValidationError } from "@/lib/errors";
import { defaultContestRules, contestRulesSchema } from "@/lib/validators";
import { recordAdminAction } from "@/lib/admin-audit";
import { resolveContestProblems, uniqueContestSlug } from "@/lib/contest-mutations";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().max(5000).optional(),
  durationMinutes: z.number().int().min(10).max(24 * 60).default(120),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  rules: contestRulesSchema.partial().optional(),
  problemIds: z.array(z.string()).min(1).max(50),
  visibility: z.enum(["PUBLIC", "UNLISTED", "INSTITUTION", "PRIVATE"]).default("PUBLIC"),
  joinPolicy: z.enum(["OPEN", "CODE", "PASSWORD", "ROSTER", "INVITE", "STAFF_ONLY"]).default("OPEN"),
});

export async function GET() {
  try {
    const session = await getSession();
    assertCan(session, "system:admin");
    const contests = await prisma.contest.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { registrations: true, problems: true } },
      },
    });
    return NextResponse.json({ ok: true, contests });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "system:admin");
    const admin = session;

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid contest data", parsed.error.flatten());
    }

    const data = parsed.data;
    const problemRows = await resolveContestProblems(data.problemIds);
    const startDate = data.startsAt ? new Date(data.startsAt) : null;
    const endDate = data.endsAt ? new Date(data.endsAt) : null;
    if (startDate && endDate && endDate <= startDate) {
      throw new ValidationError("End time must be after start time");
    }
    const slug = await uniqueContestSlug(data.title);
    const rules = { ...defaultContestRules, ...data.rules };

    const contest = await prisma.$transaction(async (tx) => {
      const created = await tx.contest.create({
        data: {
          title: data.title,
          slug,
          description: data.description || "",
          durationMinutes: data.durationMinutes,
          startsAt: startDate,
          endsAt: endDate,
          status: data.startsAt ? "SCHEDULED" : "DRAFT",
          rules,
          visibility: data.visibility,
          joinPolicy: data.joinPolicy,
          createdById: admin.id,
          problems: { create: problemRows },
        },
        include: { problems: true },
      });
      await tx.contestStaff.create({
        data: { contestId: created.id, userId: admin.id, role: "OWNER", addedById: admin.id },
      });
      return created;
    });
    await recordAdminAction({
      actorId: admin.id,
      action: "CONTEST_CREATED",
      targetType: "CONTEST",
      targetId: contest.id,
      details: { title: contest.title, status: contest.status },
    });

    return NextResponse.json({ ok: true, contest });
  } catch (err) {
    return toResponse(err);
  }
}
