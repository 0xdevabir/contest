import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reportSubmission, type ReportPatch } from "@/lib/submission-state";
import { toResponse, AuthError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fallback ingestion path (D3's API table) for a worker topology that can
 * reach Redis but not Postgres directly. Shares `reportSubmission` with the
 * worker's direct-DB path (src/lib/submission-state.ts) so the exactly-once
 * semantics are identical either way — this endpoint is 40 lines and it
 * removes a hard deployment constraint, per the phase doc.
 */
const BodySchema = z.object({
  submissionId: z.string(),
  workerId: z.string(),
  verdict: z.string(),
  score: z.number().int().optional(),
  maxScore: z.number().int().optional(),
  timeMs: z.number().int().optional(),
  maxCpuMs: z.number().int().optional(),
  maxWallMs: z.number().int().optional(),
  maxMemoryKb: z.number().int().optional(),
  compileMs: z.number().int().optional(),
  stdout: z.string().nullable().optional(),
  stderr: z.string().nullable().optional(),
  report: z.unknown().optional(),
});

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.JUDGE_SHARED_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-judge-signature");
    if (!verifySignature(rawBody, signature)) throw new AuthError("Invalid signature");

    const parsed = BodySchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) throw new ValidationError("Invalid report payload", parsed.error.flatten());

    const { submissionId, workerId, ...patch } = parsed.data;
    const applied = await reportSubmission(submissionId, workerId, {
      ...patch,
      verdict: patch.verdict as ReportPatch["verdict"],
    });

    return NextResponse.json({ ok: true, applied });
  } catch (err) {
    return toResponse(err);
  }
}
