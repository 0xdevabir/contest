import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { toResponse, AuthError, ValidationError } from "@/lib/errors";
import { rateHint } from "@/lib/ai/features/hint";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ helpful: z.boolean() });

/** "Logged with an optional 'was this helpful'... both a quality signal and
 * the training data for improving the prompt" (feature 5). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) throw new AuthError();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw new ValidationError("Invalid request", parsed.error.flatten());

    await rateHint(id, session!.id, parsed.data.helpful);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
