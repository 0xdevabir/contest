import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/v1/openapi";
import { isEnabled } from "@/lib/flags";

export const runtime = "nodejs";

let cached: unknown | null = null;

export async function GET() {
  if (!(await isEnabled("platformApi"))) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  }
  if (!cached) cached = buildOpenApiDocument();
  return NextResponse.json(cached);
}
