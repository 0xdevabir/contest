import { describe, it, expect } from "vitest";
import {
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  toResponse,
} from "./errors";

async function bodyOf(res: Response) {
  return (await res.json()) as { ok: boolean; code: string; message: string; details?: unknown };
}

describe("AppError subclasses", () => {
  it("carry the expected status/code pairs", () => {
    expect(new ValidationError("bad").status).toBe(400);
    expect(new ValidationError("bad").code).toBe("VALIDATION");
    expect(new AuthError().status).toBe(401);
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new ConflictError("dup").status).toBe(409);
    expect(new RateLimitError(5).status).toBe(429);
    expect(new InternalError().status).toBe(500);
  });

  it("default messages are set when omitted", () => {
    expect(new AuthError().message).toBe("Sign in to continue.");
    expect(new ForbiddenError().message).toBe("You do not have access to this.");
  });
});

describe("toResponse", () => {
  it("renders an AppError as { ok:false, code, message } with matching status", async () => {
    const res = toResponse(new ValidationError("bad field", { field: "email" }));
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body).toEqual({ ok: false, code: "VALIDATION", message: "bad field", details: { field: "email" } });
  });

  it("attaches a Retry-After header for RateLimitError", () => {
    const res = toResponse(new RateLimitError(42));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
  });

  it("maps legacy Error('UNAUTHORIZED') to a 401", async () => {
    const res = toResponse(new Error("UNAUTHORIZED"));
    expect(res.status).toBe(401);
    expect((await bodyOf(res)).code).toBe("UNAUTHENTICATED");
  });

  it("maps legacy Error('FORBIDDEN') to a 403", async () => {
    const res = toResponse(new Error("FORBIDDEN"));
    expect(res.status).toBe(403);
    expect((await bodyOf(res)).code).toBe("FORBIDDEN");
  });

  it("reduces an unknown error to a generic 500 without leaking internal detail", async () => {
    const res = toResponse(new Error("stack trace with secrets: DATABASE_URL=postgres://..."));
    expect(res.status).toBe(500);
    const body = await bodyOf(res);
    expect(body).toEqual({ ok: false, code: "INTERNAL", message: "Something went wrong." });
  });

  it("handles a thrown non-Error value", async () => {
    const res = toResponse("plain string throw");
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).code).toBe("INTERNAL");
  });
});
