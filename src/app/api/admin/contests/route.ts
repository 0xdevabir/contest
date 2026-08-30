import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse, ValidationError } from "@/lib/errors";
import { defaultContestRules, contestRulesSchema } from "@/lib/validators";
import { slugify } from "@/lib/contests";
import { getProblem } from "@/lib/problems";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().max(5000).optional(),
  durationMinutes: z.number().int().min(10).max(24 * 60).default(120),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  rules: contestRulesSchema.partial().optional(),
  problemIds: z.array(z.string()).min(1).max(50),
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
    const invalidProblem = data.problemIds.find((problemId) => !getProblem(problemId));
    if (invalidProblem) {
      throw new ValidationError(`Unknown problem: ${invalidProblem}`);
    }
    if (new Set(data.problemIds).size !== data.problemIds.length) {
      throw new ValidationError("A problem can only be added once");
    }
    const startDate = data.startsAt ? new Date(data.startsAt) : null;
    const endDate = data.endsAt ? new Date(data.endsAt) : null;
    if (startDate && endDate && endDate <= startDate) {
      throw new ValidationError("End time must be after start time");
    }
    let slug = slugify(data.title);
    if (!slug) slug = `contest-${Date.now().toString(36)}`;
    const exists = await prisma.contest.findUnique({ where: { slug } });
    if (exists) slug = `${slug}-${Date.now().toString(36)}`;

    const rules = { ...defaultContestRules, ...data.rules };
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const contest = await prisma.contest.create({
      data: {
        title: data.title,
        slug,
        description: data.description || "",
        durationMinutes: data.durationMinutes,
        startsAt: startDate,
        endsAt: endDate,
        status: data.startsAt ? "SCHEDULED" : "DRAFT",
        rules,
        createdById: admin.id,
        problems: {
          create: data.problemIds.map((problemId, i) => ({
            problemId,
            order: i,
            points: 100,
            label: labels[i] || `P${i + 1}`,
          })),
        },
      },
      include: { problems: true },
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
