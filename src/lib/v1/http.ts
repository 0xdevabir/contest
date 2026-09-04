import { NextResponse } from "next/server";
import { AppError, AuthError, NotFoundError, RateLimitError } from "../errors";
import { log } from "../log";
import { consume, retryAfterSeconds } from "../ratelimit";
import { authenticateApiKey, requireScope, type ApiScope, type AuthenticatedKey } from "../api-keys";
import { isEnabled } from "../flags";

/**
 * D1 (docs/phases/PHASE-12-platform-api.md) — the public envelope. Distinct
 * from the internal `{ ok, code, message }` shape in src/lib/errors.ts:
 * third-party consumers get `{ data, pagination }` on success and
 * `{ error: { code, message, details } }` on failure, reusing the same
 * AppError codes so the two surfaces never diverge in meaning.
 */
export function v1Data(data: unknown, pagination?: { nextCursor: string | null; hasMore: boolean }, status = 200) {
  const body: Record<string, unknown> = { data };
  if (pagination) {
    body.pagination = { next_cursor: pagination.nextCursor, has_more: pagination.hasMore };
  }
  return NextResponse.json(body, { status });
}

export function v1Error(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const body = { error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } };
    const init: { status: number; headers?: Record<string, string> } = { status: err.status };
    if (err instanceof RateLimitError) {
      init.headers = { "Retry-After": String(Math.max(0, Math.ceil(err.retryAfterSec))) };
    }
    if (err.status >= 500) log.error("v1 unhandled app error", { code: err.code }, err);
    return NextResponse.json(body, init);
  }
  log.error("v1 unhandled error", {}, err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong." } }, { status: 500 });
}

/** Opaque, forward-only keyset cursor: base64 of the last row's `id`. Every
 * v1 list endpoint orders by `id` (cuids are lexicographically time-ordered
 * at creation) so this stays correct without a secondary sort key. */
export function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null): string | undefined {
  if (!cursor) return undefined;
  try {
    return Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    return undefined;
  }
}

export function parsePageParams(url: URL): { limit: number; cursor: string | undefined } {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  return { limit, cursor };
}

/**
 * Every /api/v1/** route starts with this: the `platformApi` flag gate,
 * Bearer-token auth, scope enforcement, and the key's own per-minute rate
 * limit (D2 — default 60/min, admin-configurable per key).
 */
export async function requireApiKey(req: Request, scope: ApiScope | null): Promise<AuthenticatedKey> {
  if (!(await isEnabled("platformApi"))) {
    throw new NotFoundError("Not found");
  }

  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    throw new AuthError("Missing or malformed Authorization header.");
  }
  const key = await authenticateApiKey(match[1].trim());
  if (scope) requireScope(key, scope);

  const result = await consume({ bucket: "apikey", identity: key.id }, { tokens: key.rateLimit, windowSec: 60 });
  if (!result.ok) {
    throw new RateLimitError(retryAfterSeconds(result.resetAt), "Rate limit exceeded for this API key.");
  }

  return key;
}
