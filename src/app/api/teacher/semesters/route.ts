import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { toResponse, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(2).max(40),
  code: z.string().trim().min(2).max(20),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

/**
 * Not in the doc's API contract table, but a section can't be created
 * without one — the teacher-facing "new section" flow needs a way to list
 * and add Semesters for their institution.
 */
export async function GET() {
  try {
    const session = await getSession();
    assertCan(session, "section:manage");
    await assertClassroomEnabled(session);
    if (!session.institutionId) return NextResponse.json({ ok: true, semesters: [] });

    const semesters = await prisma.semester.findMany({
      where: { institutionId: session.institutionId },
      orderBy: { startsAt: "desc" },
    });
    return NextResponse.json({ ok: true, semesters });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "section:manage");
    await assertClassroomEnabled(session);
    if (!session.institutionId) throw new ValidationError("Join an institution before creating a semester");

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid semester data", parsed.error.flatten());
    const data = parsed.data;

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (endsAt <= startsAt) throw new ValidationError("End date must be after start date");

    const semester = await prisma.semester.create({
      data: { institutionId: session.institutionId, name: data.name, code: data.code, startsAt, endsAt },
    });
    return NextResponse.json({ ok: true, semester });
  } catch (err) {
    return toResponse(err);
  }
}
