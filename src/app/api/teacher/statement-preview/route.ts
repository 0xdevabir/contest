import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse, ValidationError } from "@/lib/errors";
import { renderDraftStatement } from "@/lib/statement";

export const runtime = "nodejs";

/** Live Markdown+KaTeX preview while authoring — never cached (see
 * statement.ts's renderDraftStatement), gated to anyone allowed to author a
 * problem at all (ownership doesn't matter for a stateless render). */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "problem:create");

    const body = await req.json();
    if (typeof body?.markdown !== "string") throw new ValidationError("markdown required");

    const html = await renderDraftStatement(body.markdown.slice(0, 50_000));
    return NextResponse.json({ ok: true, html });
  } catch (err) {
    return toResponse(err);
  }
}
