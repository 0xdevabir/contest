import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Invalid credentials" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return NextResponse.json({ ok: false, message: "Invalid email or password" }, { status: 401 });
    }
    if (user.status === "SUSPENDED") {
      return NextResponse.json(
        { ok: false, message: "This account has been suspended. Contact an administrator." },
        { status: 403 }
      );
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

    return NextResponse.json({
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
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, message: "Login failed" }, { status: 500 });
  }
}

