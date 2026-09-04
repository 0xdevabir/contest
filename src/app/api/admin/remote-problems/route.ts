import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, ValidationError } from "@/lib/errors";
import { getAdapter } from "@/lib/federation/adapter";
import "@/lib/federation/codeforces";

export const runtime = "nodejs";

const syncSchema = z.object({ provider: z.literal("codeforces"), externalId: z.string().min(1) });

/** GET /api/admin/remote-problems — RemoteProblem rows already synced. */
export async function GET() {
  try {
    await requireAdmin();
    const rows = await prisma.remoteProblem.findMany({ orderBy: { fetchedAt: "desc" }, take: 200 });
    return NextResponse.json({ ok: true, problems: rows });
  } catch (err) {
    return toResponse(err);
  }
}

/** POST /api/admin/remote-problems — fetches metadata via the adapter and
 * upserts a RemoteProblem row (D4: "a problem reference ... Statements are
 * linked, never copied"). */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const parsed = syncSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const adapter = getAdapter(parsed.data.provider);
    if (!adapter) throw new ValidationError(`No adapter registered for "${parsed.data.provider}"`);

    const meta = await adapter.fetchProblem(parsed.data.externalId);
    const row = await prisma.remoteProblem.upsert({
      where: { provider_externalId: { provider: meta.provider, externalId: meta.externalId } },
      create: { ...meta, fetchedAt: new Date() },
      update: { title: meta.title, url: meta.url, difficulty: meta.difficulty, tags: meta.tags, fetchedAt: new Date() },
    });
    return NextResponse.json({ ok: true, problem: row });
  } catch (err) {
    return toResponse(err);
  }
}
