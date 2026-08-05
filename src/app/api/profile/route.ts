import { NextResponse } from "next/server";
import { z } from "zod";
import type { University } from "@prisma/client";
import { getSession, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { THEME_COOKIE, THEME_IDS } from "@/lib/theme";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(280).optional(),
  university: z.enum(["DIU", "NSU", "AIUB", "BRAC"]).optional(),
  studentId: z.string().trim().max(40).nullable().optional(),
  department: z.string().trim().max(80).nullable().optional(),
  theme: z.enum(["system", ...THEME_IDS] as [string, ...string[]]).optional(),
  editorFontSize: z.number().int().min(12).max(20).optional(),
  profilePublic: z.boolean().optional(),
  showEmail: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const updated = await prisma.user.update({
    where: { id: session.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      ...(data.university !== undefined
        ? { university: data.university as University }
        : {}),
      ...(data.studentId !== undefined ? { studentId: data.studentId || null } : {}),
      ...(data.department !== undefined ? { department: data.department || null } : {}),
      ...(data.theme !== undefined ? { theme: data.theme } : {}),
      ...(data.editorFontSize !== undefined ? { editorFontSize: data.editorFontSize } : {}),
      ...(data.profilePublic !== undefined ? { profilePublic: data.profilePublic } : {}),
      ...(data.showEmail !== undefined ? { showEmail: data.showEmail } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      university: true,
      role: true,
      emailVerified: true,
      theme: true,
    },
  });

  // Refresh JWT so nav shows the new name / university immediately.
  await setSessionCookie({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    university: updated.university,
    role: updated.role,
    emailVerified: Boolean(updated.emailVerified),
  });

  const res = NextResponse.json({ ok: true, theme: updated.theme });
  if (data.theme) {
    res.cookies.set(THEME_COOKIE, data.theme, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return res;
}

