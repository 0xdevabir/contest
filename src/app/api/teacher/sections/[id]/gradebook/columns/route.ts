import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionTeacher } from "@/lib/section-access";
import { invalidateGradebookCache } from "@/lib/gradebook";
import { toResponse, ValidationError, NotFoundError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Not itemized in the doc's API table, but required by D3's "MANUAL column
 * as the pressure valve" and by "a lab quiz run as a ROSTER contest appears
 * as a gradebook column" (acceptance criterion 7) — both need a way to add
 * the column in the first place. Teacher only.
 */
const bodySchema = z.object({
  source: z.enum(["MANUAL", "CONTEST"]),
  contestId: z.string().optional(),
  title: z.string().trim().min(1).max(120),
  maxPoints: z.number().min(1).max(10000).default(100),
  weight: z.number().min(0).max(100).default(1),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid column data", parsed.error.flatten());
    const data = parsed.data;

    if (data.source === "CONTEST") {
      if (!data.contestId) throw new ValidationError("contestId is required for a CONTEST column");
      const contest = await prisma.contest.findUnique({ where: { id: data.contestId } });
      if (!contest || contest.sectionId !== id) {
        throw new NotFoundError("That contest is not scoped to this section");
      }
    }

    const order = await prisma.gradebookColumn.count({ where: { sectionId: id } });
    const column = await prisma.gradebookColumn.create({
      data: {
        sectionId: id,
        source: data.source,
        contestId: data.source === "CONTEST" ? data.contestId : null,
        title: data.title,
        maxPoints: data.maxPoints,
        weight: data.weight,
        order,
        published: false,
      },
    });

    invalidateGradebookCache(id);
    return NextResponse.json({ ok: true, column });
  } catch (err) {
    return toResponse(err);
  }
}
