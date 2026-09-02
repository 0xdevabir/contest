import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionStaff, assertSectionTeacher } from "@/lib/section-access";
import { getProblemRef } from "@/lib/problems";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const problemSchema = z.object({
  problemSlug: z.string(),
  points: z.number().int().min(1).max(1000).default(100),
  required: z.boolean().default(true),
});

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  descriptionMd: z.string().max(20000).optional(),
  opensAt: z.string().datetime().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  closesAt: z.string().datetime().optional().nullable(),
  latePolicy: z.enum(["NONE", "LINEAR", "GRACE_THEN_LINEAR", "REJECT"]).default("NONE"),
  lateParam: z.number().min(0).max(1000).default(0),
  weight: z.number().min(0).max(100).default(1),
  showPeers: z.boolean().default(false),
  problems: z.array(problemSchema).min(1).max(30),
});

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionStaff(session, id);

    const assignments = await prisma.assignment.findMany({
      where: { sectionId: id },
      orderBy: { createdAt: "desc" },
      include: { problems: { orderBy: { order: "asc" } }, _count: { select: { extensions: true } } },
    });
    return NextResponse.json({ ok: true, assignments });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid assignment data", parsed.error.flatten());
    const data = parsed.data;

    if (data.opensAt && data.dueAt && new Date(data.dueAt) <= new Date(data.opensAt)) {
      throw new ValidationError("Due date must be after the open date");
    }

    const refs = await Promise.all(
      data.problems.map(async (p) => [p.problemSlug, await getProblemRef(p.problemSlug)] as const)
    );
    const missing = refs.find(([, ref]) => !ref || !ref.versionId)?.[0];
    if (missing) throw new ValidationError(`Problem not available: ${missing}`);
    const refBySlug = new Map(refs);

    const totalPoints = data.problems.reduce((s, p) => s + p.points, 0);

    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.assignment.create({
        data: {
          sectionId: id,
          title: data.title,
          descriptionMd: data.descriptionMd ?? "",
          opensAt: data.opensAt ? new Date(data.opensAt) : null,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          closesAt: data.closesAt ? new Date(data.closesAt) : null,
          latePolicy: data.latePolicy,
          lateParam: data.lateParam,
          weight: data.weight,
          showPeers: data.showPeers,
          problems: {
            create: data.problems.map((p, i) => {
              const ref = refBySlug.get(p.problemSlug)!;
              return {
                problemId: ref!.problemId,
                problemVersionId: ref!.versionId!,
                order: i,
                points: p.points,
                required: p.required,
              };
            }),
          },
        },
        include: { problems: true },
      });

      const maxColumnOrder = await tx.gradebookColumn.count({ where: { sectionId: id } });
      await tx.gradebookColumn.create({
        data: {
          sectionId: id,
          source: "ASSIGNMENT",
          assignmentId: created.id,
          title: created.title,
          maxPoints: totalPoints || 100,
          weight: data.weight,
          order: maxColumnOrder,
          published: false,
        },
      });

      return created;
    });

    await recordAdminAction({
      actorId: session.id,
      action: "assignment.create",
      targetType: "ASSIGNMENT",
      targetId: assignment.id,
      details: { sectionId: id, title: data.title },
    });

    return NextResponse.json({ ok: true, assignment });
  } catch (err) {
    return toResponse(err);
  }
}
