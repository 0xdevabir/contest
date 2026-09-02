import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertIntegrityScopeStaff, INTEGRITY_SCOPE_TYPES } from "@/lib/integrity/access";
import { runIntegritySweep } from "@/lib/integrity/sweep";
import { toResponse, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  scopeType: z.enum(INTEGRITY_SCOPE_TYPES),
  scopeId: z.string().min(1),
});

/** Teacher-triggered similarity sweep — synchronous per the phase doc's
 * perf target, no queue needed. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid data");

    await assertIntegrityScopeStaff(session, parsed.data.scopeType, parsed.data.scopeId);

    const persisted = await runIntegritySweep(parsed.data.scopeType, parsed.data.scopeId);
    return NextResponse.json({ ok: true, persisted });
  } catch (err) {
    return toResponse(err);
  }
}
