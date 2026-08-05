import { NextResponse } from "next/server";
import type { University } from "@prisma/client";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { sendVerifyEmail } from "@/lib/mail";
import { createAuthToken, hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const first =
        parsed.error.issues[0]?.message || "Invalid registration data";
      return NextResponse.json(
        { ok: false, message: first, issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, password, university, studentId, department } = parsed.data;
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existing) {
      return NextResponse.json(
        { ok: false, message: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        university: university as University,
        studentId: studentId || null,
        department: department || null,
      },
    });

    const token = await createAuthToken(user.id, "EMAIL_VERIFY", 1000 * 60 * 60 * 24);
    try {
      await sendVerifyEmail(user.email, user.name, token);
    } catch (err) {
      console.error("verify email send failed", err);
      // still allow account; user can resend
    }

    await setSessionCookie({
      id: user.id,
      email: user.email,
      name: user.name,
      university: user.university,
      role: user.role,
      emailVerified: false,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        university: user.university,
        role: user.role,
      },
      message: "Account created. Check your email to verify.",
    });
  } catch (err) {
    console.error("register failed", err);
    const code =
      err && typeof err === "object" && "code" in err ? String(err.code) : undefined;
    return NextResponse.json(
      { ok: false, message: "Registration failed. Please try again.", code },
      { status: 500 }
    );
  }
}


