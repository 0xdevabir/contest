import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { hasTestDb } from "../setup";
import { _resetRateLimitsForTests } from "@/lib/ratelimit";

const sentVerifyTokens: string[] = [];
const sentResetCodes: string[] = [];
vi.mock("@/lib/mail", () => ({
  sendVerifyEmail: vi.fn(async (_to: string, _name: string, token: string) => {
    sentVerifyTokens.push(token);
  }),
  sendPasswordResetCode: vi.fn(async (_to: string, _name: string, code: string) => {
    sentResetCodes.push(code);
  }),
  appUrl: (p = "") => `http://localhost:3000${p}`,
}));

// next/headers' cookies() only works inside a real Next.js request scope
// (confirmed: calling it bare here throws "cookies was called outside a
// request scope"). Session cookie read/write is exercised elsewhere — jose
// signing in src/lib/auth.ts is a thin, well-typed wrapper — so these routes
// are tested for their actual logic (validation, rate limits, DB state)
// without going through next/headers.
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => null),
  setSessionCookie: vi.fn(async () => undefined),
  clearSessionCookie: vi.fn(async () => undefined),
  refreshSessionFromDb: vi.fn(async () => undefined),
}));

function req(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  sentVerifyTokens.length = 0;
  sentResetCodes.length = 0;
  _resetRateLimitsForTests();
});

describe.skipIf(!hasTestDb)("auth lifecycle", () => {
  const email = "lifecycle@example.com";
  const password = "correct-horse-battery-staple";

  it("register -> verify -> login -> forgot -> verify code -> reset happy path", async () => {
    const { POST: register } = await import("@/app/api/auth/register/route");
    const registerRes = await register(
      req("/api/auth/register", {
        name: "Lifecycle User",
        email,
        password,
        university: "DIU",
      })
    );
    expect(registerRes.status).toBe(200);
    expect(sentVerifyTokens.length).toBe(1);

    const { POST: verifyEmail } = await import("@/app/api/auth/verify-email/route");
    const verifyRes = await verifyEmail(req("/api/auth/verify-email", { token: sentVerifyTokens[0] }));
    expect(verifyRes.status).toBe(200);

    const { POST: login } = await import("@/app/api/auth/login/route");
    const loginRes = await login(req("/api/auth/login", { email, password }));
    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.user.email).toBe(email);

    const { POST: forgot } = await import("@/app/api/auth/forgot-password/route");
    const forgotRes = await forgot(req("/api/auth/forgot-password", { email }));
    expect(forgotRes.status).toBe(200);
    expect(sentResetCodes.length).toBe(1);
    const code = sentResetCodes[0];

    const { POST: verifyCode } = await import("@/app/api/auth/verify-reset-code/route");
    const verifyCodeRes = await verifyCode(req("/api/auth/verify-reset-code", { email, code }));
    expect(verifyCodeRes.status).toBe(200);

    const newPassword = "another-strong-password-2";
    const { POST: resetPassword } = await import("@/app/api/auth/reset-password/route");
    const resetRes = await resetPassword(
      req("/api/auth/reset-password", { email, code, password: newPassword })
    );
    expect(resetRes.status).toBe(200);

    const { POST: loginAgain } = await import("@/app/api/auth/login/route");
    const oldLoginRes = await loginAgain(req("/api/auth/login", { email, password }));
    expect(oldLoginRes.status).toBe(401);
    const newLoginRes = await loginAgain(req("/api/auth/login", { email, password: newPassword }));
    expect(newLoginRes.status).toBe(200);
  });

  it("rejects login after too many failed attempts from the same IP+email", async () => {
    const { POST: register } = await import("@/app/api/auth/register/route");
    await register(
      req("/api/auth/register", {
        name: "Rate Limited",
        email: "ratelimited@example.com",
        password,
        university: "DIU",
      })
    );

    const { POST: login } = await import("@/app/api/auth/login/route");
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await login(
        req("/api/auth/login", { email: "ratelimited@example.com", password: "wrong-password" })
      );
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBeTruthy();
  });

  it("rejects duplicate registration with the same email", async () => {
    const { POST: register } = await import("@/app/api/auth/register/route");
    const dupEmail = "duplicate@example.com";
    const first = await register(
      req("/api/auth/register", { name: "First", email: dupEmail, password, university: "DIU" })
    );
    expect(first.status).toBe(200);
    const second = await register(
      req("/api/auth/register", { name: "Second", email: dupEmail, password, university: "DIU" })
    );
    expect(second.status).toBe(409);
  });
});
