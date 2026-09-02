import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse, ValidationError } from "@/lib/errors";
import { defaultContestRules, contestRulesSchema } from "@/lib/validators";
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
  visibility: z.enum(["PUBLIC", "UNLISTED", "INSTITUTION", "PRIVATE"]).default("PRIVATE"),
  joinPolicy: z.enum(["OPEN", "CODE", "PASSWORD", "ROSTER", "INVITE", "STAFF_ONLY"]).default("OPEN"),
});

/** Teacher-scoped contest listing/creation — mirrors `/api/admin/contests`
 * but scoped to contests the teacher owns or staffs, and capability-gated
 * instead of admin-only. */
export async function GET() {
  try {
    const session = await getSession();
    assertCan(session, "contest:create");
    const contests = await prisma.contest.findMany({
      where: { OR: [{ createdById: session.id }, { staff: { some: { userId: session.id } } }] },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { registrations: true, problems: true } } },
    });
    return NextResponse.json({ ok: true, contests });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "contest:create");

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid contest data", parsed.error.flatten());
    const data = parsed.data;

    const rows = await resolveContestProblems(data.problemIds);
    const startDate = data.startsAt ? new Date(data.startsAt) : null;
    const endDate = data.endsAt ? new Date(data.endsAt) : null;
    if (startDate && endDate && endDate <= startDate) throw new ValidationError("End time must be after start time");

    // docs/phases/PHASE-05-contest-engine.md risk table: teacher-created
    // contests default to PRIVATE; a teacher may only request PUBLIC when
    // their own institution is verified, otherwise it's silently downgraded
    // rather than rejected (admins can still promote it after review).
    let visibility = data.visibility;
    if (visibility === "PUBLIC") {
      const institution = session.institutionId
        ? await prisma.institution.findUnique({ where: { id: session.institutionId }, select: { verified: true } })
        : null;
      if (!institution?.verified) visibility = "PRIVATE";
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
          status: startDate ? "SCHEDULED" : "DRAFT",
          rules,
          visibility,
          joinPolicy: data.joinPolicy,
          institutionId: session.institutionId,
          createdById: session.id,
          problems: { create: rows },
        },
        include: { problems: true },
      });
      await tx.contestStaff.create({
        data: { contestId: created.id, userId: session.id, role: "OWNER", addedById: session.id },
      });
      return created;
    });

    return NextResponse.json({ ok: true, contest });
  } catch (err) {
    return toResponse(err);
  }
}
