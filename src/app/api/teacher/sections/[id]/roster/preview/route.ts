import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionTeacher } from "@/lib/section-access";
import { parseRoster, applyRoster } from "@/lib/roster";
import { toResponse, ValidationError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Multipart upload -> parsed preview with per-row outcomes. No writes. */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("No file uploaded");
    if (file.size > 5 * 1024 * 1024) throw new ValidationError("File too large (max 5MB)");

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseRoster(buffer, file.name);

    const mappingOverride = form.get("mapping");
    const mapping = mappingOverride ? JSON.parse(String(mappingOverride)) : parsed.mapping;

    const { rows: preview, summary } = await applyRoster(id, parsed.rows, {
      mapping,
      dryRun: true,
    });

    return NextResponse.json({
      ok: true,
      detectedColumns: parsed.detectedColumns,
      mapping,
      warnings: parsed.warnings,
      headers: parsed.rows.length > 0 ? Object.keys(parsed.rows[0]) : [],
      rawRows: parsed.rows,
      preview,
      summary,
    });
  } catch (err) {
    return toResponse(err);
  }
}
