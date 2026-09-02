import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionTeacher } from "@/lib/section-access";
import { computeGradebook } from "@/lib/gradebook";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ label: z.string().trim().min(1).max(200) });

/** Freezes the whole book — teacher only. */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("A label is required");

    const gradebook = await computeGradebook(id);
    const snapshot = await prisma.gradebookSnapshot.create({
      data: {
        sectionId: id,
        label: parsed.data.label,
        data: JSON.parse(JSON.stringify(gradebook)),
        createdById: session.id,
      },
    });

    await recordAdminAction({
      actorId: session.id,
      action: "gradebook.snapshot",
      targetType: "GRADEBOOK",
      targetId: id,
      details: { label: parsed.data.label, snapshotId: snapshot.id },
    });

    return NextResponse.json({ ok: true, snapshot: { id: snapshot.id, label: snapshot.label, createdAt: snapshot.createdAt } });
  } catch (err) {
    return toResponse(err);
  }
}
