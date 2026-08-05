import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail, sendVerifyEmail } from "@/lib/mail";
import { createAuthToken } from "@/lib/password";
import { forgotSchema } from "@/lib/validators";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode = body.mode === "resend-verify" ? "resend-verify" : "forgot";

    if (mode === "resend-verify") {
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ ok: false, message: "Login required" }, { status: 401 });
      }
      const user = await prisma.user.findUnique({ where: { id: session.id } });
      if (!user) {
        return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
      }
      if (user.emailVerified) {
        return NextResponse.json({ ok: true, message: "Already verified" });
      }
      const token = await createAuthToken(user.id, "EMAIL_VERIFY", 1000 * 60 * 60 * 24);
      await sendVerifyEmail(user.email, user.name, token);
      return NextResponse.json({ ok: true, message: "Verification email sent" });
    }

    const parsed = forgotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Invalid email" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    // Always succeed to avoid email enumeration
    if (user) {
      const token = await createAuthToken(user.id, "PASSWORD_RESET", 1000 * 60 * 60);
      try {
        await sendPasswordResetEmail(user.email, user.name, token);
      } catch (err) {
        console.error("reset mail failed", err);
        return NextResponse.json({ ok: false, message: "Could not send email" }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      message: "If that email exists, a reset link was sent.",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, message: "Request failed" }, { status: 500 });
  }
}
