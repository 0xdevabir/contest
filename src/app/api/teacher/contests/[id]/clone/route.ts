import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { contestCapabilities } from "@/lib/contest-access";
import { cloneContest } from "@/lib/contest-mutations";
import { toResponse, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  copyStaff: z.boolean().default(false),
  asTemplate: z.boolean().default(false),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "contest:create");

    const { id } = await params;
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("view")) throw new ForbiddenError();

    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid data");

    const clone = await cloneContest(id, session.id, parsed.data);
    return NextResponse.json({ ok: true, contest: clone });
  } catch (err) {
    return toResponse(err);
  }
}
