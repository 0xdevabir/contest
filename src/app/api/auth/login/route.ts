import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { THEME_COOKIE, normalizeThemeMode } from "@/lib/theme";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validators";
import { toResponse, ValidationError, AuthError, ForbiddenError, RateLimitError } from "@/lib/errors";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { clientIp } from "@/lib/request-context";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    return toResponse(err);
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Invalid credentials");
  }

  const email = parsed.data.email.toLowerCase();
  const ip = clientIp(req);

  const rl = await consume(
    { bucket: "auth:login", identity: `${ip}:${email}` },
    { tokens: 10, windowSec: 15 * 60 }
  );
  if (!rl.ok) {
    throw new RateLimitError(retryAfterSeconds(rl.resetAt), "Too many login attempts. Try again shortly.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    throw new AuthError("Invalid email or password");
  }
  if (user.status === "SUSPENDED") {
    throw new ForbiddenError("This account has been suspended. Contact an administrator.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await setSessionCookie({
    id: user.id,
    email: user.email,
    name: user.name,
    university: user.university,
    role: user.role,
    emailVerified: !!user.emailVerified,
  });

  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      university: user.university,
      role: user.role,
      emailVerified: !!user.emailVerified,
    },
  });

  // Carry the saved theme to this device so the first paint after login is
  // already correct instead of flashing the default.
  res.cookies.set(THEME_COOKIE, normalizeThemeMode(user.theme), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
