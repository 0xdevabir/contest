import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchAll, searchProblems, searchContests, searchUsers } from "@/lib/search";
import { toResponse, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().min(1).max(200),
  type: z.enum(["problems", "contests", "users"]).optional(),
  limit: z.coerce.number().int().min(1).max(25).optional(),
});

/**
 * Phase 13 Part 3 — GET /api/search?q=&type=&limit=. `type` narrows to one
 * entity (a bigger per-type `limit`); omitted, it runs `searchAll` with a
 * small per-type limit for a combined/global result.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      q: searchParams.get("q") ?? "",
      type: searchParams.get("type") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) throw new ValidationError("Invalid search query", parsed.error.flatten());

    const { q, type, limit } = parsed.data;

    if (type === "problems") {
      return NextResponse.json({ ok: true, results: await searchProblems(q, limit ?? 10) });
    }
    if (type === "contests") {
      return NextResponse.json({ ok: true, results: await searchContests(q, limit ?? 10) });
    }
    if (type === "users") {
      return NextResponse.json({ ok: true, results: await searchUsers(q, limit ?? 10) });
    }

    const results = await searchAll(q, limit ?? 5);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return toResponse(err);
  }
}
