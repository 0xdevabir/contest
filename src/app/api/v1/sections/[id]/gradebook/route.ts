import { requireApiKey, v1Data, v1Error } from "@/lib/v1/http";
import { assertSectionTeacher } from "@/lib/section-access";
import { computeGradebookCached } from "@/lib/gradebook";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/sections/{id}/gradebook — the teacher's own section only. */
export async function GET(req: Request, { params }: Params) {
  try {
    const key = await requireApiKey(req, "sections:read");
    const { id } = await params;
    await assertSectionTeacher(key.owner, id);

    const gradebook = await computeGradebookCached(id);
    return v1Data(gradebook);
  } catch (err) {
    return v1Error(err);
  }
}
