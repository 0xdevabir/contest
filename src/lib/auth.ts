import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role, University } from "@prisma/client";
import { prisma } from "./db";
import { normalizeThemeMode, type ThemeMode } from "./theme";

const COOKIE = "diu_contesthub_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  university: University;
  role: Role;
  emailVerified: boolean;
  /** Read fresh from the DB so the theme follows the account across devices. */
  theme: ThemeMode;
};

const SESSION_SELECT = {
  id: true,
  email: true,
  name: true,
  university: true,
  role: true,
  status: true,
  emailVerified: true,
  theme: true,
} as const;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/** The theme is never a JWT claim — it is always read fresh from the row. */
type SessionClaims = Omit<SessionUser, "theme">;

export async function createSessionToken(user: SessionClaims): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error("AUTH_SECRET is not set");
  return new SignJWT({
    email: user.email,
    name: user.name,
    university: user.university,
    role: user.role,
    emailVerified: user.emailVerified,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key);
}

export async function setSessionCookie(user: SessionClaims) {
  const token = await createSessionToken(user);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const key = secretKey();
  if (!key) return null;
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const id = payload.sub;
    if (!id) return null;
    const user = await prisma.user.findUnique({
      where: { id },
      select: SESSION_SELECT,
    });
    if (!user || user.status !== "ACTIVE") return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      university: user.university,
      role: user.role,
      emailVerified: Boolean(user.emailVerified),
      theme: normalizeThemeMode(user.theme),
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: SESSION_SELECT,
  });
  if (!user || user.status !== "ACTIVE") throw new Error("UNAUTHORIZED");
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    university: user.university,
    role: user.role,
    emailVerified: Boolean(user.emailVerified),
    theme: normalizeThemeMode(user.theme),
  };
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireUser();
  if (session.role !== "ADMIN") throw new Error("FORBIDDEN");
  return session;
}

export async function refreshSessionFromDb(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    await clearSessionCookie();
    return null;
  }
  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    university: user.university,
    role: user.role,
    emailVerified: !!user.emailVerified,
    theme: normalizeThemeMode(user.theme),
  };
  await setSessionCookie(session);
  return session;
}

export { COOKIE as SESSION_COOKIE };




