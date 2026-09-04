import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, AuthError, ValidationError } from "@/lib/errors";
import { assertCan } from "@/lib/authz";
import { getBlobStore } from "@/lib/blob";
import { enqueueImportJob } from "@/lib/import/runner";

export const runtime = "nodejs";

const KINDS = new Set(["polygon", "generic", "csv"]);

/** POST /api/teacher/import — uploads a package and creates + enqueues an
 * ImportJob (D3). "New problem" beside "Import package" in the teacher UI. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    assertCan(session, "problem:create");

    const form = await req.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    if (!(file instanceof File)) throw new ValidationError('Missing file (field "file")');
    if (typeof kind !== "string" || !KINDS.has(kind)) throw new ValidationError('kind must be "polygon", "generic", or "csv"');

    const buf = Buffer.from(await file.arrayBuffer());
    const job = await prisma.importJob.create({
      data: { kind, userId: session.id, sourceKey: "", status: "PENDING" },
    });

    const ext = kind === "csv" ? "csv" : "zip";
    const store = getBlobStore();
    const { key } = await store.put(`imports/${job.id}.${ext}`, buf);
    await prisma.importJob.update({ where: { id: job.id }, data: { sourceKey: key } });

    await enqueueImportJob(job.id);

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (err) {
    return toResponse(err);
  }
}

/** GET /api/teacher/import — the caller's own import history. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const jobs = await prisma.importJob.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ ok: true, jobs });
  } catch (err) {
    return toResponse(err);
  }
}
