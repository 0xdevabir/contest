import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { normalizeThemeMode, type ThemeMode } from "./theme";
import { normalizeLocale, type Locale } from "@/i18n";
import { hashToken, rawToken } from "./password";

const COOKIE = "codehub_session";
const REFRESH_COOKIE = "codehub_refresh";
const ACCESS_TTL_SEC = 60 * 30; // 30 minutes
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  institutionId: string | null;
  institutionVerifiedAt: Date | null;
  teacherApprovedAt: Date | null;
  emailVerified: boolean;
  /** Read fresh from the DB so the theme follows the account across devices. */
  theme: ThemeMode;
  /** Phase 14 — same cross-device semantics as `theme`. Optional so existing
   * test fixtures that predate this field keep compiling; `toSessionUser`
   * always populates it for real sessions via `normalizeLocale`. */
  locale?: Locale;
};

const SESSION_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  institutionId: true,
  institutionVerifiedAt: true,
  teacherApprovedAt: true,
  emailVerified: true,
  theme: true,
  locale: true,
} as const;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

function toSessionUser(user: {
  id: string;
  email: string;
  name: string;
  role: Role;
  institutionId: string | null;
  institutionVerifiedAt: Date | null;
  teacherApprovedAt: Date | null;
  emailVerified: Date | null;
  theme: string;
  locale: string;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    institutionId: user.institutionId,
    institutionVerifiedAt: user.institutionVerifiedAt,
    teacherApprovedAt: user.teacherApprovedAt,
    emailVerified: Boolean(user.emailVerified),
    theme: normalizeThemeMode(user.theme),
    locale: normalizeLocale(user.locale),
  };
}

async function signAccessToken(userId: string, sid: string): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error("AUTH_SECRET is not set");
  return new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(key);
}

async function setAccessCookie(userId: string, sid: string) {
  const token = await signAccessToken(userId, sid);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_TTL_SEC,
  });
}

async function setRefreshCookie(token: string) {
  const jar = await cookies();
  jar.set(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: REFRESH_TTL_MS / 1000,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete({ name: REFRESH_COOKIE, path: "/api/auth" });
}

/**
 * Creates a new `Session` row and sets both cookies. Called from login and
 * register — the only two places a brand-new session is minted.
 */
export async function createSession(
  userId: string,
  meta?: { userAgent?: string; ip?: string }
): Promise<void> {
  const token = rawToken();
  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashToken(token),
      userAgent: meta?.userAgent?.slice(0, 300) ?? "",
      ip: meta?.ip ?? "",
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  await setAccessCookie(userId, session.id);
  await setRefreshCookie(token);
}

// --- Revocation cache -------------------------------------------------
// getSession() would otherwise hit the Session table on every request just
// to check `revokedAt IS NULL`. Cache the (usually negative) result for a
// short window; a revoke eagerly evicts the entry so it takes effect
// immediately rather than waiting out the TTL.
const REVOCATION_CACHE_TTL_MS = 60_000;
const revocationCache = new Map<string, { live: boolean; expiresAt: number }>();

async function isSessionLive(sid: string): Promise<boolean> {
  const cached = revocationCache.get(sid);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.live;

  const row = await prisma.session.findUnique({
    where: { id: sid },
    select: { revokedAt: true, expiresAt: true },
  });
  const live = !!row && row.revokedAt == null && row.expiresAt.getTime() > now;
  revocationCache.set(sid, { live, expiresAt: now + REVOCATION_CACHE_TTL_MS });
  return live;
}

function evictRevocationCache(sid: string) {
  revocationCache.delete(sid);
}

export async function revokeSession(sid: string, reason: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sid, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  evictRevocationCache(sid);
}

export async function revokeAllSessions(userId: string, reason: string): Promise<void> {
  const live = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    select: { id: true },
  });
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  for (const s of live) evictRevocationCache(s.id);
}

/**
 * Phase 10 D5 — single-session binding for strict-mode contests. Called when
 * a user enters a strict-mode contest: every other live session for the
 * user is revoked (stops "hand your login to a stronger friend" mid-exam),
 * and this session is stamped with `boundContestId` so a later login attempt
 * can detect and refuse the conflict.
 */
export async function bindSessionToContest(sessionId: string, userId: string, contestId: string): Promise<void> {
  const others = await prisma.session.findMany({
    where: { userId, revokedAt: null, id: { not: sessionId } },
    select: { id: true },
  });
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, id: { not: sessionId } },
    data: { revokedAt: new Date(), revokedReason: "strict-mode-rebind" },
  });
  for (const s of others) evictRevocationCache(s.id);

  await prisma.session.update({ where: { id: sessionId }, data: { boundContestId: contestId } });
}

/**
 * The user's other live session (if any) still bound to a contest that is
 * currently LIVE — a second login while that's true is the "hand your
 * credentials to a friend mid-exam" cheat D5 exists to close.
 */
export async function findLiveStrictBinding(userId: string): Promise<{ sessionId: string; contestId: string } | null> {
  const bound = await prisma.session.findFirst({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, boundContestId: { not: null } },
    select: { id: true, boundContestId: true },
  });
  if (!bound?.boundContestId) return null;

  const contest = await prisma.contest.findUnique({ where: { id: bound.boundContestId }, select: { status: true } });
  if (contest?.status !== "LIVE") return null;

  return { sessionId: bound.id, contestId: bound.boundContestId };
}

/**
 * Verifies the access JWT, confirms the backing Session is still live, then
 * re-reads the user row fresh — role/teacherApprovedAt/institution fields
 * must never be trusted from the (possibly 30-minutes-stale) JWT, since a
 * teacher approval or suspension must take effect on the very next request.
 */
export async function getSession(): Promise<SessionUser | null> {
  const key = secretKey();
  if (!key) return null;
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const id = payload.sub;
    const sid = typeof payload.sid === "string" ? payload.sid : null;
    if (!id || !sid) return null;
    if (!(await isSessionLive(sid))) return null;

    const user = await prisma.user.findUnique({ where: { id }, select: SESSION_SELECT });
    if (!user || user.status !== "ACTIVE") return null;
    return toSessionUser(user);
  } catch {
    return null;
  }
}

/** The Session row id (`sid`) backing the current access token, if any. */
export async function getCurrentSessionId(): Promise<string | null> {
  const key = secretKey();
  if (!key) return null;
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireUser();
  if (session.role !== "ADMIN") throw new Error("FORBIDDEN");
  return session;
}

/**
 * Re-mints the access token for the *current* session (same `sid`) after a
 * mutation to the signed-in user's own row (email verified, profile saved),
 * so the browser doesn't need to wait out the old token's TTL to see it.
 */
export async function refreshSessionFromDb(userId: string): Promise<SessionUser | null> {
  const key = secretKey();
  if (!key) return null;
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  let sid: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, key);
      if (payload.sub === userId && typeof payload.sid === "string") sid = payload.sid;
    } catch {
      /* fall through with sid = null */
    }
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: SESSION_SELECT });
  if (!user) {
    await clearSessionCookie();
    return null;
  }
  if (!sid) return toSessionUser(user);

  await setAccessCookie(userId, sid);
  return toSessionUser(user);
}

export type RefreshOutcome =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "reuse_detected" };

/**
 * Consumes the refresh cookie and rotates it: the presented token is marked
 * revoked and a fresh Session row + refresh token replace it. Presenting a
 * token that maps to an already-revoked row means it was stolen and already
 * used once — the whole account's sessions are revoked as a precaution.
 */
export async function rotateRefreshToken(meta?: {
  userAgent?: string;
  ip?: string;
}): Promise<RefreshOutcome> {
  const jar = await cookies();
  const raw = jar.get(REFRESH_COOKIE)?.value;
  if (!raw) return { ok: false, reason: "invalid" };

  const hash = hashToken(raw);
  const row = await prisma.session.findUnique({ where: { refreshTokenHash: hash } });
  if (!row) return { ok: false, reason: "invalid" };

  if (row.revokedAt) {
    await revokeAllSessions(row.userId, "refresh-token-reuse");
    await clearSessionCookie();
    return { ok: false, reason: "reuse_detected" };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    await revokeSession(row.id, "expired");
    await clearSessionCookie();
    return { ok: false, reason: "expired" };
  }

  const newToken = rawToken();
  const next = await prisma.session.create({
    data: {
      userId: row.userId,
      refreshTokenHash: hashToken(newToken),
      userAgent: meta?.userAgent?.slice(0, 300) ?? row.userAgent,
      ip: meta?.ip ?? row.ip,
      boundContestId: row.boundContestId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  await revokeSession(row.id, "rotated");

  await setAccessCookie(row.userId, next.id);
  await setRefreshCookie(newToken);
  return { ok: true };
}

export { COOKIE as SESSION_COOKIE, REFRESH_COOKIE };
