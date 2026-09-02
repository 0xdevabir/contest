import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionTeacher } from "@/lib/section-access";
import { applyRoster, type RawRow } from "@/lib/roster";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.string())),
  mapping: z.object({
    email: z.string().optional(),
    studentId: z.string().optional(),
    name: z.string().optional(),
  }),
  removeMissing: z.boolean().default(false),
});

/** Commits a previously-previewed mapping. */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid roster data", parsed.error.flatten());

    const { rows, summary } = await applyRoster(id, parsed.data.rows as RawRow[], {
      mapping: parsed.data.mapping,
      dryRun: false,
      removeMissing: parsed.data.removeMissing,
    });

    await recordAdminAction({
      actorId: session.id,
      action: "roster.import",
      targetType: "SECTION",
      targetId: id,
      details: summary,
    });

    return NextResponse.json({ ok: true, rows, summary });
  } catch (err) {
    return toResponse(err);
  }
}
