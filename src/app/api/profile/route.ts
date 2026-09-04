import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, refreshSessionFromDb } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { THEME_COOKIE, THEME_IDS } from "@/lib/theme";
import { LOCALE_COOKIE, LOCALES } from "@/i18n";
import { toResponse, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(280).optional(),
  studentId: z.string().trim().max(40).nullable().optional(),
  department: z.string().trim().max(80).nullable().optional(),
  theme: z.enum(["system", ...THEME_IDS] as [string, ...string[]]).optional(),
  locale: z.enum(LOCALES).optional(),
  editorFontSize: z.number().int().min(12).max(20).optional(),
  profilePublic: z.boolean().optional(),
  showEmail: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  try {
    return await handlePatch(req);
  } catch (err) {
    return toResponse(err);
  }
}

async function handlePatch(req: Request): Promise<NextResponse> {
  const session = await getSession();
  assertCan(session, "profile:edit", { ownerId: session?.id });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON.");
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const data = parsed.data;
  await prisma.user.update({
    where: { id: session.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      ...(data.studentId !== undefined ? { studentId: data.studentId || null } : {}),
      ...(data.department !== undefined ? { department: data.department || null } : {}),
      ...(data.theme !== undefined ? { theme: data.theme } : {}),
      ...(data.locale !== undefined ? { locale: data.locale } : {}),
      ...(data.editorFontSize !== undefined ? { editorFontSize: data.editorFontSize } : {}),
      ...(data.profilePublic !== undefined ? { profilePublic: data.profilePublic } : {}),
      ...(data.showEmail !== undefined ? { showEmail: data.showEmail } : {}),
    },
  });

  // Refresh the access token's underlying user snapshot so nav shows the new
  // name immediately (role/institution are always re-read from the DB anyway).
  const updated = await refreshSessionFromDb(session.id);

  const res = NextResponse.json({
    ok: true,
    theme: updated?.theme ?? data.theme,
    locale: updated?.locale ?? data.locale,
  });
  if (data.theme) {
    res.cookies.set(THEME_COOKIE, data.theme, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  if (data.locale) {
    res.cookies.set(LOCALE_COOKIE, data.locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return res;
}
