import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPasswordResetCode, sendVerifyEmail } from "@/lib/mail";
import { createAuthToken, createPasswordResetCode } from "@/lib/password";
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
      try {
        await sendVerifyEmail(user.email, user.name, token);
      } catch (err) {
        console.error("verify email mail failed", err);
        return NextResponse.json(
          {
            ok: false,
            message:
              "Could not send the verification email. Check SMTP settings and try again.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ ok: true, message: "Verification email sent" });
    }

    const parsed = forgotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Invalid email" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    // Unknown emails still look like success so accounts cannot be probed.
    if (!user) {
      return NextResponse.json({
        ok: true,
        message: "If that email exists, an 8-digit reset code was sent.",
      });
    }

    const recentCode = await prisma.authToken.findFirst({
      where: {
        userId: user.id,
        type: "PASSWORD_RESET",
        createdAt: { gt: new Date(Date.now() - 1000 * 60) },
        expiresAt: { gt: new Date() },
      },
    });
    if (recentCode) {
      return NextResponse.json(
        {
          ok: false,
          message: "Please wait about a minute before requesting another code.",
        },
        { status: 429 }
      );
    }

    const code = await createPasswordResetCode(user.id);
    try {
      await sendPasswordResetCode(user.email, user.name, code);
    } catch (err) {
      console.error("reset code mail failed", err);
      // Burn the unused code so a later retry can mint a fresh one immediately.
      await prisma.authToken
        .deleteMany({ where: { userId: user.id, type: "PASSWORD_RESET" } })
        .catch(() => undefined);
      return NextResponse.json(
        {
          ok: false,
          message:
            "Could not send the reset email. The mail server rejected the request — check SMTP credentials and try again.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "If that email exists, an 8-digit reset code was sent.",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, message: "Request failed" }, { status: 500 });
  }
}
