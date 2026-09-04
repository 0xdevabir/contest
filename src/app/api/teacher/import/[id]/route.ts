import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, AuthError, NotFoundError, ForbiddenError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    const { id } = await params;

    const job = await prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundError("Import job not found");
    if (job.userId !== session.id && session.role !== "ADMIN") throw new ForbiddenError();

    return NextResponse.json({ ok: true, job });
  } catch (err) {
    return toResponse(err);
  }
}
