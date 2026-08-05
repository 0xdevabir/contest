import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consumeAuthToken, hashPassword } from "@/lib/password";
import { resetSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Invalid reset data" }, { status: 400 });
    }

    const userId = await consumeAuthToken(parsed.data.token, "PASSWORD_RESET");
    if (!userId) {
      return NextResponse.json({ ok: false, message: "Invalid or expired token" }, { status: 400 });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true, message: "Password updated. You can log in now." });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, message: "Reset failed" }, { status: 500 });
  }
}
