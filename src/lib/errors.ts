import { NextResponse } from "next/server";
import { log } from "./log";

/**
 * Every API route ends its error path here. A thrown AppError carries its own
 * status/code/message; anything else is treated as a bug — logged with full
 * detail server-side and reduced to a generic message for the client, so
 * internal error text (stack traces, DB errors) never reaches the browser.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION", message, 400, details);
    this.name = "ValidationError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Sign in to continue.") {
    super("UNAUTHENTICATED", message, 401);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this.") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(readonly retryAfterSec: number, message = "Too many requests. Try again shortly.") {
    super("RATE_LIMITED", message, 429);
    this.name = "RateLimitError";
  }
}

export class InternalError extends AppError {
  constructor(message = "Something went wrong.") {
    super("INTERNAL", message, 500);
    this.name = "InternalError";
  }
}

/**
 * Every API route's catch block ends with `return toResponse(err)`. Body shape
 * keeps the pre-existing `{ ok: false, message }` contract the frontend already
 * parses, and adds `code`/`details` additively so nothing breaks.
 */
export function toResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      ok: false,
      code: err.code,
      message: err.message,
    };
    if (err.details !== undefined) body.details = err.details;

    const init: { status: number; headers?: Record<string, string> } = { status: err.status };
    if (err instanceof RateLimitError) {
      init.headers = { "Retry-After": String(Math.max(0, Math.ceil(err.retryAfterSec))) };
    }
    if (err.status >= 500) {
      log.error("unhandled app error", { code: err.code, status: err.status }, err);
    }
    return NextResponse.json(body, init);
  }

  // Legacy compatibility: routes not yet migrated to AppError throw plain
  // Error("UNAUTHORIZED") / Error("FORBIDDEN") from src/lib/auth.ts helpers.
  if (err instanceof Error && (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN")) {
    const status = err.message === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json(
      { ok: false, code: err.message === "UNAUTHORIZED" ? "UNAUTHENTICATED" : "FORBIDDEN", message: err.message === "UNAUTHORIZED" ? "Sign in to continue." : "You do not have access to this." },
      { status }
    );
  }

  log.error("unhandled error", {}, err);
  return NextResponse.json(
    { ok: false, code: "INTERNAL", message: "Something went wrong." },
    { status: 500 }
  );
}
